(function () {
  "use strict";

  var results = document.getElementById("results");
  var failures = 0;

  function record(name, error) {
    var item = document.createElement("li");
    item.textContent = error ? "FAIL: " + name + " — " + error.message : "PASS: " + name;
    results.appendChild(item);
    if (error) failures += 1;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  async function test(name, fn) {
    try {
      await fn();
      record(name, null);
    } catch (error) {
      record(name, error);
    }
  }

  async function run() {
    await test("global API is available", function () {
      assert(window.SqlHighlighter, "SqlHighlighter is missing");
      assert(typeof window.SqlHighlighter.attach === "function", "attach is missing");
      assert(typeof window.SqlHighlighter.loadDialect === "function", "loadDialect is missing");
    });

    await test("browser dictionary files register both dialects", function () {
      assert(window.SqlHighlighter.getDialect("bigquery").id === "bigquery");
      assert(window.SqlHighlighter.getDialect("duckdb").id === "duckdb");
    });

    await test("BigQuery lexical forms are highlighted", function () {
      var html = window.SqlHighlighter.highlight(
        "SELECT `user-id`, @limit FROM t # note\nWHERE name = r'''SELECT\\nFROM''' AND payload = b\"abc\"",
        "bigquery"
      );
      assert(html.indexOf('sqhl-keyword">SELECT</span>') !== -1, "SELECT is not a keyword");
      assert(html.indexOf('sqhl-column">`user-id`</span>') !== -1, "backtick column missing");
      assert(html.indexOf('sqhl-parameter">@limit</span>') !== -1, "named parameter missing");
      assert(html.indexOf('sqhl-comment"># note</span>') !== -1, "hash comment missing");
      assert(html.indexOf("sqhl-string\">r'''SELECT\\nFROM'''</span>") !== -1, "raw triple string missing");
      assert(html.indexOf('sqhl-string">b&quot;abc&quot;</span>') !== -1, "bytes string missing");
    });

    await test("DuckDB lexical forms are highlighted", function () {
      var html = window.SqlHighlighter.highlight(
        "SELECT \"select\", 100_000, $$SELECT FROM hidden$$, $tag$WHERE$tag$, E'line\\nnext', $1",
        "duckdb"
      );
      assert(html.indexOf('sqhl-column">&quot;select&quot;</span>') !== -1, "quoted column missing");
      assert(html.indexOf('sqhl-number">100_000</span>') !== -1, "numeric underscore missing");
      assert(html.indexOf('sqhl-string">$$SELECT FROM hidden$$</span>') !== -1, "dollar string missing");
      assert(html.indexOf('sqhl-string">$tag$WHERE$tag$</span>') !== -1, "tagged dollar string missing");
      assert(html.indexOf("sqhl-string\">E'line\\nnext'</span>") !== -1, "escape string missing");
      assert(html.indexOf('sqhl-parameter">$1</span>') !== -1, "positional parameter missing");
    });

    await test("semantic token classes follow the configured highlight rules", function () {
      var html = window.SqlHighlighter.highlight(
        "WITH customer_sales AS (SELECT customer_id, SUM(amount) AS total_sales FROM orders AS o WHERE status = 'active' AND amount >= 100 AND customer_id IN (1, 2) AND deleted_at IS NULL) SELECT customer_id FROM customer_sales",
        "bigquery"
      );

      assert(html.indexOf('sqhl-keyword">WITH</span>') !== -1, "WITH is not a keyword");
      assert(html.indexOf('sqhl-table">customer_sales</span>') !== -1, "CTE name is not a table");
      assert(html.indexOf('sqhl-column">customer_id</span>') !== -1, "identifier fallback is not a column");
      assert(html.indexOf('sqhl-function">SUM</span>') !== -1, "SUM is not a function");
      assert(html.indexOf('sqhl-alias">total_sales</span>') !== -1, "AS alias is not an alias");
      assert(html.indexOf('sqhl-table">orders</span>') !== -1, "FROM target is not a table");
      assert(html.indexOf('sqhl-alias">o</span>') !== -1, "table alias is not an alias");
      assert(html.indexOf('sqhl-string">&#39;active&#39;</span>') === -1, "unexpected apostrophe escaping contract");
      assert(html.indexOf('sqhl-string">\'active\'</span>') !== -1, "string is not highlighted");
      assert(html.indexOf('sqhl-operator">AND</span>') !== -1, "AND is not an operator");
      assert(html.indexOf('sqhl-operator">&gt;=</span>') !== -1, ">= is not an operator");
      assert(html.indexOf('sqhl-number">100</span>') !== -1, "number is not highlighted");
      assert(html.indexOf('sqhl-literal">NULL</span>') !== -1, "NULL is not a literal");
    });

    await test("AS-defined aliases are recognized before their definition", function () {
      var html = window.SqlHighlighter.highlight(
        "SELECT o.customer_id FROM orders AS o WHERE o.customer_id = 1",
        "bigquery"
      );
      var aliasMatches = html.match(/sqhl-alias\">o<\/span>/g) || [];
      assert(aliasMatches.length === 3, "table alias references were not classified consistently");
    });

    await test("colon parameters are highlighted", function () {
      var html = window.SqlHighlighter.highlight("SELECT :customer_id", "bigquery");
      assert(html.indexOf('sqhl-parameter">:customer_id</span>') !== -1, "colon parameter missing");
    });

    await test("highlight CSS matches the requested palette and font styles", function () {
      var host = document.createElement("div");
      host.className = "sqhl-editor";
      [
        ["keyword", "rgb(9, 145, 182)", "italic", "none", "rgba(0, 0, 0, 0)"],
        ["operator", "rgb(123, 48, 208)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["function", "rgb(177, 16, 142)", "italic", "none", "rgba(0, 0, 0, 0)"],
        ["table", "rgb(41, 112, 199)", "normal", "underline", "rgba(0, 0, 0, 0)"],
        ["column", "rgb(130, 130, 130)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["alias", "rgb(127, 219, 202)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["string", "rgb(164, 65, 133)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["number", "rgb(23, 71, 129)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["literal", "rgb(23, 71, 129)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["comment", "rgb(53, 123, 66)", "normal", "none", "rgb(242, 242, 242)"],
        ["parameter", "rgb(198, 62, 211)", "normal", "none", "rgba(0, 0, 0, 0)"],
        ["punctuation", "rgb(62, 62, 62)", "normal", "none", "rgba(0, 0, 0, 0)"]
      ].forEach(function (entry) {
        var span = document.createElement("span");
        span.className = "sqhl-" + entry[0];
        span.textContent = entry[0];
        host.appendChild(span);
      });
      document.body.appendChild(host);

      Array.prototype.forEach.call(host.children, function (span, index) {
        var expected = [
          ["rgb(9, 145, 182)", "italic", "none", "rgba(0, 0, 0, 0)"], ["rgb(123, 48, 208)", "normal", "none", "rgba(0, 0, 0, 0)"],
          ["rgb(177, 16, 142)", "italic", "none", "rgba(0, 0, 0, 0)"], ["rgb(41, 112, 199)", "normal", "underline", "rgba(0, 0, 0, 0)"],
          ["rgb(130, 130, 130)", "normal", "none", "rgba(0, 0, 0, 0)"], ["rgb(127, 219, 202)", "normal", "none", "rgba(0, 0, 0, 0)"],
          ["rgb(164, 65, 133)", "normal", "none", "rgba(0, 0, 0, 0)"], ["rgb(23, 71, 129)", "normal", "none", "rgba(0, 0, 0, 0)"],
          ["rgb(23, 71, 129)", "normal", "none", "rgba(0, 0, 0, 0)"], ["rgb(53, 123, 66)", "normal", "none", "rgb(242, 242, 242)"],
          ["rgb(198, 62, 211)", "normal", "none", "rgba(0, 0, 0, 0)"], ["rgb(62, 62, 62)", "normal", "none", "rgba(0, 0, 0, 0)"]
        ][index];
        var style = window.getComputedStyle(span);
        assert(style.color === expected[0], span.className + " color mismatch: " + style.color);
        assert(style.fontStyle === expected[1], span.className + " font-style mismatch: " + style.fontStyle);
        assert(style.textDecorationLine === expected[2], span.className + " text-decoration mismatch: " + style.textDecorationLine);
        assert(style.backgroundColor === expected[3], span.className + " background mismatch: " + style.backgroundColor);
      });
      host.remove();
    });

    await test("range decorations preserve syntax classes and can be cleared", function () {
      var host = document.createElement("div");
      var textarea = document.createElement("textarea");
      textarea.value = "SELECT customer_id, customer_id FROM orders";
      host.appendChild(textarea);
      document.body.appendChild(host);

      var editor = window.SqlHighlighter.attach(textarea, { dialect: "bigquery" });
      editor.setDecorations([
        { start: 7, end: 18, className: "test-match" },
        { start: 7, end: 18, className: "test-current" },
        { start: 20, end: 31, className: "test-match" }
      ]);

      var html = editor.element.querySelector(".sqhl-highlight").innerHTML;
      assert(html.indexOf('class="sqhl-column test-match test-current">customer_id</span>') !== -1, "overlapping decoration classes missing");
      assert(html.indexOf('class="sqhl-column test-match">customer_id</span>') !== -1, "second decoration missing");

      editor.clearDecorations();
      html = editor.element.querySelector(".sqhl-highlight").innerHTML;
      assert(html.indexOf("test-match") === -1, "clearDecorations did not clear ranges");
      assert(html.indexOf("test-current") === -1, "clearDecorations did not clear overlapping range");

      editor.detach();
      host.remove();
    });

    await test("range decoration input is validated", function () {
      var host = document.createElement("div");
      var textarea = document.createElement("textarea");
      textarea.value = "SELECT 1";
      host.appendChild(textarea);
      document.body.appendChild(host);
      var editor = window.SqlHighlighter.attach(textarea, { dialect: "bigquery" });

      var invalidRange = false;
      try {
        editor.setDecorations([{ start: 3, end: 3, className: "test-match" }]);
      } catch (error) {
        invalidRange = error instanceof TypeError;
      }
      assert(invalidRange, "empty decoration range was accepted");

      var invalidClass = false;
      try {
        editor.setDecorations([{ start: 0, end: 1, className: '" onmouseover="bad' }]);
      } catch (error) {
        invalidClass = error instanceof TypeError;
      }
      assert(invalidClass, "unsafe decoration class was accepted");

      editor.detach();
      host.remove();
    });

    await test("renderer escapes SQL text", function () {
      var html = window.SqlHighlighter.highlight("SELECT '<tag>&'", "bigquery");
      assert(html.indexOf("<tag>") === -1, "raw tag leaked into HTML");
      assert(html.indexOf("&lt;tag&gt;&amp;") !== -1, "escaped text missing");
    });

    await test("attach creates a no-wrap editor with line numbers", function () {
      var host = document.createElement("div");
      var textarea = document.createElement("textarea");
      textarea.style.width = "420px";
      textarea.style.height = "160px";
      textarea.value = "SELECT 1;\nSELECT 2;\nSELECT 3;";
      host.appendChild(textarea);
      document.body.appendChild(host);

      var editor = window.SqlHighlighter.attach(textarea, {
        dialect: "bigquery",
        lineNumbers: true,
        tabSize: 2
      });

      assert(textarea.parentElement.classList.contains("sqhl-editor"), "wrapper missing");
      assert(textarea.getAttribute("wrap") === "off", "textarea wrap is not off");
      assert(textarea.parentElement.querySelector(".sqhl-gutter").textContent === "1\n2\n3", "line numbers incorrect");
      assert(textarea.parentElement.querySelector(".sqhl-highlight").innerHTML.indexOf("sqhl-keyword") !== -1, "highlight layer not rendered");

      editor.setDialect("duckdb");
      textarea.value = "SELECT count(*)::BIGINT";
      editor.refresh();
      assert(textarea.parentElement.querySelector(".sqhl-highlight").innerHTML.indexOf("sqhl-keyword") !== -1, "dialect switch failed");

      editor.detach();
      assert(textarea.parentElement === host, "textarea was not restored");
      host.remove();
    });

    document.body.dataset.status = failures === 0 ? "passed" : "failed";
    var summary = document.createElement("p");
    summary.id = "summary";
    summary.textContent = failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED";
    document.body.appendChild(summary);
  }

  run();
}());
