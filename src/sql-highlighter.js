(function (global) {
  "use strict";

  var dialects = Object.create(null);
  var attachments = typeof WeakMap === "function" ? new WeakMap() : null;
  var TOKEN_CLASS_PREFIX = "sqhl-";
  var DEFAULT_OPERATORS = [
    "->>", "->", "::", "<=", ">=", "<>", "!=", "||", "&&", ":=", "=>", "<<", ">>",
    "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^"
  ];
  var PUNCTUATION = Object.freeze({
    "(": true, ")": true, "[": true, "]": true, "{": true, "}": true,
    ",": true, ";": true, ".": true, ":": true
  });
  var WORD_OPERATORS = Object.freeze({
    "AND": true,
    "OR": true,
    "NOT": true,
    "IN": true,
    "LIKE": true,
    "ILIKE": true,
    "BETWEEN": true,
    "IS": true
  });
  var SPECIAL_LITERALS = Object.freeze({
    "NULL": true,
    "TRUE": true,
    "FALSE": true
  });
  var TABLE_INTRODUCERS = Object.freeze({
    "FROM": true,
    "JOIN": true,
    "UPDATE": true,
    "INTO": true
  });

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function toWordSet(values, fieldName) {
    if (values == null) return Object.freeze(Object.create(null));
    if (!Array.isArray(values)) throw new TypeError(fieldName + " must be an array");

    var set = Object.create(null);
    values.forEach(function (value) {
      if (typeof value !== "string" || !value) {
        throw new TypeError(fieldName + " entries must be non-empty strings");
      }
      set[value.toUpperCase()] = true;
    });
    return Object.freeze(set);
  }

  function toStringArray(values, fieldName, fallback) {
    var source = values == null ? fallback : values;
    if (!Array.isArray(source)) throw new TypeError(fieldName + " must be an array");
    return Object.freeze(source.map(function (value) {
      if (typeof value !== "string" || !value) {
        throw new TypeError(fieldName + " entries must be non-empty strings");
      }
      return value;
    }).sort(function (a, b) {
      return b.length - a.length;
    }));
  }

  function toBlockComments(values) {
    if (values == null) return Object.freeze([]);
    if (!Array.isArray(values)) throw new TypeError("blockComments must be an array");

    return Object.freeze(values.map(function (pair) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) {
        throw new TypeError("blockComments entries must be [start, end] pairs");
      }
      return Object.freeze([String(pair[0]), String(pair[1])]);
    }).sort(function (a, b) {
      return b[0].length - a[0].length;
    }));
  }

  function normalizeDialect(id, definition) {
    if (typeof id !== "string" || !id.trim()) {
      throw new TypeError("Dialect id must be a non-empty string");
    }
    if (!definition || typeof definition !== "object") {
      throw new TypeError("Dialect definition must be an object");
    }

    var lexical = definition.lexical || definition;
    var parameterModes = toStringArray(lexical.parameterModes, "lexical.parameterModes", []);
    parameterModes.forEach(function (mode) {
      if (["question", "atName", "colonName", "dollarNumber", "dollarName"].indexOf(mode) === -1) {
        throw new TypeError("Unsupported parameter mode: " + mode);
      }
    });

    return Object.freeze({
      id: id.toLowerCase(),
      displayName: String(definition.displayName || id),
      keywords: toWordSet(definition.keywords, "keywords"),
      functions: toWordSet(definition.functions, "functions"),
      dataTypes: toWordSet(definition.dataTypes, "dataTypes"),
      lineComments: toStringArray(lexical.lineComments, "lexical.lineComments", ["--"]),
      blockComments: toBlockComments(lexical.blockComments || [["/*", "*/"]]),
      identifierQuotes: toStringArray(lexical.identifierQuotes, "lexical.identifierQuotes", []),
      stringQuotes: toStringArray(lexical.stringQuotes, "lexical.stringQuotes", ["'"]),
      tripleStringQuotes: toStringArray(lexical.tripleStringQuotes, "lexical.tripleStringQuotes", []),
      stringPrefixes: toStringArray(lexical.stringPrefixes, "lexical.stringPrefixes", []),
      rawStringPrefixes: toStringArray(lexical.rawStringPrefixes, "lexical.rawStringPrefixes", []),
      dollarQuotedStrings: lexical.dollarQuotedStrings === true,
      numericUnderscores: lexical.numericUnderscores === true,
      parameterModes: parameterModes,
      operators: toStringArray(lexical.operators, "lexical.operators", DEFAULT_OPERATORS)
    });
  }

  function registerDialect(id, definition) {
    var dialectId = id;
    var dialectDefinition = definition;

    if (id && typeof id === "object" && definition == null) {
      dialectDefinition = id;
      dialectId = dialectDefinition.id;
    }

    var normalized = normalizeDialect(dialectId, dialectDefinition);
    dialects[normalized.id] = normalized;
    return normalized;
  }

  function loadDialect(url) {
    if (typeof global.fetch !== "function") {
      return Promise.reject(new Error("fetch is not available in this browser"));
    }

    return global.fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load SQL dialect: " + response.status + " " + response.statusText);
      }
      return response.json();
    }).then(function (definition) {
      return registerDialect(definition);
    });
  }

  function getDialect(id) {
    var key = String(id || "").toLowerCase();
    if (!own(dialects, key)) throw new Error("Unknown SQL dialect: " + id);
    return dialects[key];
  }

  function isWordStart(character) {
    return !!character && /[A-Za-z_]/.test(character);
  }

  function isWordPart(character) {
    return !!character && /[A-Za-z0-9_$]/.test(character);
  }

  function startsWithAt(source, needle, index) {
    return source.slice(index, index + needle.length) === needle;
  }

  function nextNonWhitespace(source, index) {
    while (index < source.length && /\s/.test(source.charAt(index))) index += 1;
    return source.charAt(index);
  }

  function readDelimited(source, index, quote, allowBackslashEscape, allowDoubledQuote) {
    var cursor = index + quote.length;
    while (cursor < source.length) {
      if (allowBackslashEscape && source.charAt(cursor) === "\\") {
        cursor += 2;
        continue;
      }
      if (startsWithAt(source, quote, cursor)) {
        if (allowDoubledQuote && startsWithAt(source, quote + quote, cursor)) {
          cursor += quote.length * 2;
          continue;
        }
        return cursor + quote.length;
      }
      cursor += 1;
    }
    return source.length;
  }

  function containsIgnoreCase(values, value) {
    var canonical = String(value).toLowerCase();
    for (var i = 0; i < values.length; i += 1) {
      if (String(values[i]).toLowerCase() === canonical) return true;
    }
    return false;
  }

  function readDollarQuotedString(source, index) {
    var opening = source.slice(index).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (!opening) return index;

    var marker = opening[0];
    var end = source.indexOf(marker, index + marker.length);
    return end === -1 ? source.length : end + marker.length;
  }

  function readStringLiteral(source, index, dialect) {
    if (dialect.dollarQuotedStrings && source.charAt(index) === "$") {
      var dollarEnd = readDollarQuotedString(source, index);
      if (dollarEnd > index) return dollarEnd;
    }

    var previous = index > 0 ? source.charAt(index - 1) : "";
    if (isWordPart(previous)) return index;

    var quoteGroups = [dialect.tripleStringQuotes, dialect.stringQuotes];
    var prefixes = [""].concat(dialect.stringPrefixes);
    for (var groupIndex = 0; groupIndex < quoteGroups.length; groupIndex += 1) {
      var quotes = quoteGroups[groupIndex];
      for (var prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
        var prefix = prefixes[prefixIndex];
        for (var quoteIndex = 0; quoteIndex < quotes.length; quoteIndex += 1) {
          var quote = quotes[quoteIndex];
          var opening = prefix + quote;
          if (source.slice(index, index + opening.length).toLowerCase() !== opening.toLowerCase()) continue;

          var quoteIndexInSource = index + prefix.length;
          var raw = containsIgnoreCase(dialect.rawStringPrefixes, prefix);
          var allowDoubled = quote.length === 1;
          return readDelimited(source, quoteIndexInSource, quote, !raw, allowDoubled);
        }
      }
    }

    return index;
  }

  function readParameter(source, index, dialect) {
    var modes = dialect.parameterModes;
    var character = source.charAt(index);
    var cursor;

    if (character === "?" && modes.indexOf("question") !== -1) return index + 1;

    if (character === "@" && modes.indexOf("atName") !== -1 && isWordStart(source.charAt(index + 1))) {
      cursor = index + 2;
      while (isWordPart(source.charAt(cursor))) cursor += 1;
      return cursor;
    }

    if (character === ":" && modes.indexOf("colonName") !== -1 && isWordStart(source.charAt(index + 1))) {
      cursor = index + 2;
      while (isWordPart(source.charAt(cursor))) cursor += 1;
      return cursor;
    }

    if (character === "$" && modes.indexOf("dollarNumber") !== -1 && /[0-9]/.test(source.charAt(index + 1))) {
      cursor = index + 2;
      while (/[0-9]/.test(source.charAt(cursor))) cursor += 1;
      return cursor;
    }

    if (character === "$" && modes.indexOf("dollarName") !== -1 && isWordStart(source.charAt(index + 1))) {
      cursor = index + 2;
      while (isWordPart(source.charAt(cursor))) cursor += 1;
      return cursor;
    }

    return index;
  }

  function unquoteIdentifier(value, dialect) {
    var text = String(value);
    for (var i = 0; i < dialect.identifierQuotes.length; i += 1) {
      var quote = dialect.identifierQuotes[i];
      if (startsWithAt(text, quote, 0) && text.slice(-quote.length) === quote) {
        return text.slice(quote.length, -quote.length).replace(new RegExp(quote + quote, "g"), quote);
      }
    }
    return text;
  }

  function isContextToken(token) {
    return token.type !== "plain" && token.type !== "comment" && token.type !== "string" &&
      token.type !== "number" && token.type !== "literal" && token.type !== "parameter";
  }

  function classifyIdentifiers(tokens, dialect) {
    var aliases = Object.create(null);
    var tables = Object.create(null);
    var expectTable = false;
    var expectAlias = false;
    var expectCteName = false;
    var cteBodyDepth = null;
    var cteBaseDepth = 0;
    var cteAwaitingBody = false;
    var cteAfterBody = false;
    var depth = 0;
    var previousContext = null;
    var previousPreviousContext = null;

    function canonicalIdentifier(token) {
      return unquoteIdentifier(token.value, dialect).toUpperCase();
    }

    function rememberContext(token) {
      previousPreviousContext = previousContext;
      previousContext = token;
    }

    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!isContextToken(token)) continue;

      var canonical = token.value.toUpperCase();

      if (expectAlias && token.type !== "column") {
        expectAlias = false;
      }

      if (expectCteName && token.type === "keyword" && canonical === "RECURSIVE") {
        rememberContext(token);
        continue;
      }

      if (token.type === "column") {
        var name = canonicalIdentifier(token);
        var previousWasDot = previousContext && previousContext.type === "punctuation" && previousContext.value === ".";
        var qualifiedTablePart = previousWasDot && previousPreviousContext && previousPreviousContext.type === "table";

        if (expectCteName) {
          token.type = "table";
          tables[name] = true;
          expectCteName = false;
          cteAwaitingBody = true;
        } else if (expectTable || qualifiedTablePart) {
          token.type = "table";
          tables[name] = true;
          expectTable = false;
        } else if (expectAlias) {
          token.type = "alias";
          aliases[name] = true;
          expectAlias = false;
        } else if (own(aliases, name)) {
          token.type = "alias";
        } else if (own(tables, name) && previousContext && previousContext.type === "punctuation" && previousContext.value === ".") {
          token.type = "table";
        }

        rememberContext(token);
        continue;
      }

      if (token.type === "punctuation") {
        if (token.value === "(") {
          depth += 1;
          if (cteAwaitingBody && previousContext && previousContext.type === "keyword" && previousContext.value.toUpperCase() === "AS") {
            cteBodyDepth = depth;
            cteAwaitingBody = false;
          }
          if (expectTable) expectTable = false;
          if (expectAlias) expectAlias = false;
        } else if (token.value === ")") {
          if (cteBodyDepth !== null && depth === cteBodyDepth) {
            cteBodyDepth = null;
            cteAfterBody = true;
          }
          depth = Math.max(0, depth - 1);
        } else if (token.value === "," && cteAfterBody && depth === cteBaseDepth) {
          expectCteName = true;
          cteAfterBody = false;
        } else if (cteAfterBody && token.value !== ".") {
          cteAfterBody = false;
        }

        rememberContext(token);
        continue;
      }

      if (token.type === "keyword") {
        if (canonical === "WITH") {
          cteBaseDepth = depth;
          expectCteName = true;
          cteAwaitingBody = false;
          cteAfterBody = false;
          cteBodyDepth = null;
        } else if (own(TABLE_INTRODUCERS, canonical)) {
          expectTable = true;
        } else if (canonical === "AS") {
          if (!cteAwaitingBody) expectAlias = true;
        } else if (cteAfterBody) {
          cteAfterBody = false;
        }
      } else if (cteAfterBody) {
        cteAfterBody = false;
      }

      rememberContext(token);
    }

    function nextContextToken(startIndex) {
      for (var nextIndex = startIndex + 1; nextIndex < tokens.length; nextIndex += 1) {
        if (isContextToken(tokens[nextIndex])) return tokens[nextIndex];
      }
      return null;
    }

    for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      var unresolved = tokens[tokenIndex];
      if (unresolved.type !== "column") continue;

      var unresolvedName = canonicalIdentifier(unresolved);
      var nextContext = nextContextToken(tokenIndex);
      if (own(aliases, unresolvedName)) {
        unresolved.type = "alias";
      } else if (own(tables, unresolvedName) && nextContext && nextContext.type === "punctuation" && nextContext.value === ".") {
        unresolved.type = "table";
      }
    }

    return tokens;
  }

  function tokenize(sql, dialectId) {
    var source = String(sql == null ? "" : sql);
    var dialect = getDialect(dialectId);
    var tokens = [];
    var index = 0;

    function push(type, value) {
      if (!value) return;
      var previous = tokens[tokens.length - 1];
      if (previous && previous.type === type && type === "plain") {
        previous.value += value;
      } else {
        tokens.push({ type: type, value: value });
      }
    }

    while (index < source.length) {
      var start = index;
      var matched = false;
      var i;
      var marker;

      for (i = 0; i < dialect.lineComments.length; i += 1) {
        marker = dialect.lineComments[i];
        if (startsWithAt(source, marker, index)) {
          index = source.indexOf("\n", index + marker.length);
          if (index === -1) index = source.length;
          push("comment", source.slice(start, index));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (i = 0; i < dialect.blockComments.length; i += 1) {
        var block = dialect.blockComments[i];
        if (startsWithAt(source, block[0], index)) {
          var end = source.indexOf(block[1], index + block[0].length);
          index = end === -1 ? source.length : end + block[1].length;
          push("comment", source.slice(start, index));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (i = 0; i < dialect.identifierQuotes.length; i += 1) {
        marker = dialect.identifierQuotes[i];
        if (startsWithAt(source, marker, index)) {
          index = readDelimited(source, index, marker, false, true);
          push("column", source.slice(start, index));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      var stringEnd = readStringLiteral(source, index, dialect);
      if (stringEnd > index) {
        index = stringEnd;
        push("string", source.slice(start, index));
        continue;
      }

      var parameterEnd = readParameter(source, index, dialect);
      if (parameterEnd > index) {
        index = parameterEnd;
        push("parameter", source.slice(start, index));
        continue;
      }

      var numberPattern = dialect.numericUnderscores
        ? /^(?:0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*|(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)/
        : /^(?:0[xX][0-9A-Fa-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
      var numberMatch = source.slice(index).match(numberPattern);
      if (numberMatch) {
        index += numberMatch[0].length;
        push("number", numberMatch[0]);
        continue;
      }

      if (isWordStart(source.charAt(index))) {
        index += 1;
        while (isWordPart(source.charAt(index))) index += 1;
        var word = source.slice(start, index);
        var canonical = word.toUpperCase();
        var type = "column";

        if (own(SPECIAL_LITERALS, canonical)) type = "literal";
        else if (own(WORD_OPERATORS, canonical)) type = "operator";
        else if (own(dialect.functions, canonical) && nextNonWhitespace(source, index) === "(") type = "function";
        else if (own(dialect.keywords, canonical) || own(dialect.dataTypes, canonical)) type = "keyword";

        push(type, word);
        continue;
      }

      for (i = 0; i < dialect.operators.length; i += 1) {
        marker = dialect.operators[i];
        if (startsWithAt(source, marker, index)) {
          index += marker.length;
          push("operator", marker);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      var character = source.charAt(index);
      if (own(PUNCTUATION, character)) {
        index += 1;
        push("punctuation", character);
        continue;
      }

      index += 1;
      push("plain", character);
    }

    return classifyIdentifiers(tokens, dialect);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeDecorationClassName(className) {
    if (typeof className !== "string" || !className.trim()) {
      throw new TypeError("Decoration className must be a non-empty string");
    }

    var unique = Object.create(null);
    var classes = [];
    className.trim().split(/\s+/).forEach(function (name) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
        throw new TypeError("Decoration className contains an invalid CSS class: " + name);
      }
      if (!own(unique, name)) {
        unique[name] = true;
        classes.push(name);
      }
    });
    return Object.freeze(classes);
  }

  function normalizeDecorations(decorations, sourceLength) {
    if (decorations == null) return Object.freeze([]);
    if (!Array.isArray(decorations)) throw new TypeError("Decorations must be an array");

    return Object.freeze(decorations.map(function (decoration) {
      if (!decoration || typeof decoration !== "object") {
        throw new TypeError("Decoration entries must be objects");
      }

      var start = decoration.start;
      var end = decoration.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
        throw new TypeError("Decoration start/end must be integer offsets with 0 <= start < end");
      }
      if (typeof sourceLength === "number" && end > sourceLength) {
        throw new RangeError("Decoration end exceeds the current text length");
      }

      return Object.freeze({
        start: start,
        end: end,
        classNames: normalizeDecorationClassName(decoration.className)
      });
    }).sort(function (a, b) {
      return a.start - b.start || a.end - b.end;
    }));
  }

  function renderHighlighted(sql, dialectId, decorations) {
    var source = String(sql == null ? "" : sql);
    if (!source) return "";

    var tokens = tokenize(source, dialectId);
    var activeDecorations = decorations || [];
    var events = Object.create(null);
    var boundaries = [0, source.length];
    var tokenRanges = [];
    var tokenCursor = 0;

    tokens.forEach(function (token) {
      var tokenEnd = tokenCursor + token.value.length;
      tokenRanges.push({ start: tokenCursor, end: tokenEnd, type: token.type });
      boundaries.push(tokenEnd);
      tokenCursor = tokenEnd;
    });

    function eventAt(position) {
      var key = String(position);
      if (!own(events, key)) events[key] = { starts: [], ends: [] };
      return events[key];
    }

    activeDecorations.forEach(function (decoration) {
      if (decoration.start >= source.length || decoration.end <= 0) return;
      var start = Math.max(0, decoration.start);
      var end = Math.min(source.length, decoration.end);
      if (end <= start) return;
      boundaries.push(start, end);
      eventAt(start).starts.push(decoration.classNames);
      eventAt(end).ends.push(decoration.classNames);
    });

    boundaries.sort(function (a, b) { return a - b; });
    boundaries = boundaries.filter(function (value, index) {
      return index === 0 || value !== boundaries[index - 1];
    });

    var classCounts = Object.create(null);
    var classOrder = [];
    var classSeen = Object.create(null);
    var tokenIndex = 0;

    function changeClassCounts(classGroups, delta) {
      classGroups.forEach(function (classNames) {
        classNames.forEach(function (className) {
          if (!own(classSeen, className)) {
            classSeen[className] = true;
            classOrder.push(className);
          }
          classCounts[className] = (classCounts[className] || 0) + delta;
        });
      });
    }

    var html = "";
    for (var boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
      var segmentStart = boundaries[boundaryIndex];
      var segmentEnd = boundaries[boundaryIndex + 1];
      var event = events[String(segmentStart)];
      if (event) {
        changeClassCounts(event.ends, -1);
        changeClassCounts(event.starts, 1);
      }

      while (tokenIndex < tokenRanges.length - 1 && segmentStart >= tokenRanges[tokenIndex].end) {
        tokenIndex += 1;
      }

      var tokenType = tokenRanges[tokenIndex] ? tokenRanges[tokenIndex].type : "plain";
      var classNames = tokenType === "plain" ? [] : [TOKEN_CLASS_PREFIX + tokenType];
      classOrder.forEach(function (className) {
        if ((classCounts[className] || 0) > 0) classNames.push(className);
      });

      var escaped = escapeHtml(source.slice(segmentStart, segmentEnd));
      html += classNames.length
        ? '<span class="' + classNames.join(" ") + '">' + escaped + "</span>"
        : escaped;
    }
    return html;
  }

  function highlight(sql, dialectId) {
    return renderHighlighted(sql, dialectId, []);
  }

  function isAttached(textarea) {
    return attachments ? attachments.has(textarea) : !!textarea.__sqhlAttachment;
  }

  function saveAttachment(textarea, instance) {
    if (attachments) attachments.set(textarea, instance);
    else textarea.__sqhlAttachment = instance;
  }

  function deleteAttachment(textarea) {
    if (attachments) attachments.delete(textarea);
    else delete textarea.__sqhlAttachment;
  }

  function attach(textarea, options) {
    if (!global.HTMLTextAreaElement || !(textarea instanceof global.HTMLTextAreaElement)) {
      throw new TypeError("SqlHighlighter.attach expects an HTMLTextAreaElement");
    }
    if (!textarea.parentNode) throw new Error("The textarea must be connected to a parent element");
    if (isAttached(textarea)) throw new Error("The textarea is already attached");

    var settings = options || {};
    var dialectId = String(settings.dialect || "bigquery").toLowerCase();
    getDialect(dialectId);

    var lineNumbers = settings.lineNumbers !== false;
    var tabSize = Number(settings.tabSize == null ? 2 : settings.tabSize);
    if (!isFinite(tabSize) || tabSize < 1) throw new TypeError("tabSize must be a positive number");

    var originalParent = textarea.parentNode;
    var originalNextSibling = textarea.nextSibling;
    var originalClassName = textarea.className;
    var originalWrap = textarea.getAttribute("wrap");
    var originalSpellcheck = textarea.getAttribute("spellcheck");
    var computed = global.getComputedStyle ? global.getComputedStyle(textarea) : null;

    var wrapper = global.document.createElement("div");
    wrapper.className = "sqhl-editor" + (lineNumbers ? " sqhl-has-line-numbers" : "");
    var gutter = global.document.createElement("div");
    gutter.className = "sqhl-gutter";
    gutter.setAttribute("aria-hidden", "true");
    var code = global.document.createElement("pre");
    code.className = "sqhl-highlight";
    code.setAttribute("aria-hidden", "true");

    if (computed) {
      if (computed.width && computed.width !== "auto") wrapper.style.width = computed.width;
      if (computed.height && computed.height !== "auto") wrapper.style.height = computed.height;
      wrapper.style.setProperty("--sqhl-font-family", computed.fontFamily);
      wrapper.style.setProperty("--sqhl-font-size", computed.fontSize);
      wrapper.style.setProperty("--sqhl-font-weight", computed.fontWeight);
      wrapper.style.setProperty("--sqhl-line-height", computed.lineHeight === "normal" ? "1.5" : computed.lineHeight);
      wrapper.style.setProperty("--sqhl-letter-spacing", computed.letterSpacing);
      wrapper.style.setProperty("--sqhl-padding-top", computed.paddingTop);
      wrapper.style.setProperty("--sqhl-padding-right", computed.paddingRight);
      wrapper.style.setProperty("--sqhl-padding-bottom", computed.paddingBottom);
      wrapper.style.setProperty("--sqhl-padding-left", computed.paddingLeft);
    }
    wrapper.style.setProperty("--sqhl-tab-size", String(tabSize));

    originalParent.insertBefore(wrapper, textarea);
    wrapper.appendChild(gutter);
    wrapper.appendChild(code);
    wrapper.appendChild(textarea);

    textarea.className = (originalClassName ? originalClassName + " " : "") + "sqhl-input";
    textarea.setAttribute("wrap", "off");
    textarea.setAttribute("spellcheck", "false");

    var detached = false;
    var decorations = Object.freeze([]);

    function syncScroll() {
      code.style.transform = "translate(-" + textarea.scrollLeft + "px, -" + textarea.scrollTop + "px)";
      gutter.style.transform = "translateY(-" + textarea.scrollTop + "px)";
    }

    function refresh() {
      if (detached) return;
      var value = textarea.value;
      code.innerHTML = renderHighlighted(value, dialectId, decorations) + (value.slice(-1) === "\n" ? "\n " : "");

      if (lineNumbers) {
        var count = value.split("\n").length;
        var numbers = [];
        for (var number = 1; number <= count; number += 1) numbers.push(String(number));
        gutter.textContent = numbers.join("\n");
        wrapper.style.setProperty("--sqhl-gutter-digits", String(String(count).length));
      } else {
        gutter.textContent = "";
      }
      syncScroll();
    }

    function setDialect(nextDialectId) {
      var normalized = String(nextDialectId || "").toLowerCase();
      getDialect(normalized);
      dialectId = normalized;
      refresh();
    }

    function setDecorations(nextDecorations) {
      decorations = normalizeDecorations(nextDecorations, textarea.value.length);
      refresh();
    }

    function clearDecorations() {
      if (decorations.length === 0) return;
      decorations = Object.freeze([]);
      refresh();
    }

    function detach() {
      if (detached) return;
      detached = true;
      textarea.removeEventListener("input", refresh);
      textarea.removeEventListener("scroll", syncScroll);

      textarea.className = originalClassName;
      if (originalWrap == null) textarea.removeAttribute("wrap");
      else textarea.setAttribute("wrap", originalWrap);
      if (originalSpellcheck == null) textarea.removeAttribute("spellcheck");
      else textarea.setAttribute("spellcheck", originalSpellcheck);

      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(textarea, originalNextSibling);
      } else {
        originalParent.appendChild(textarea);
      }
      wrapper.remove();
      deleteAttachment(textarea);
    }

    var instance = Object.freeze({
      refresh: refresh,
      setDialect: setDialect,
      setDecorations: setDecorations,
      clearDecorations: clearDecorations,
      detach: detach,
      getDialect: function () { return dialectId; },
      textarea: textarea,
      element: wrapper
    });

    textarea.addEventListener("input", refresh);
    textarea.addEventListener("scroll", syncScroll);
    saveAttachment(textarea, instance);
    refresh();

    return instance;
  }

  global.SqlHighlighter = Object.freeze({
    registerDialect: registerDialect,
    loadDialect: loadDialect,
    getDialect: getDialect,
    tokenize: tokenize,
    highlight: highlight,
    attach: attach
  });
}(window));
