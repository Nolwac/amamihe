import { readFile } from "node:fs/promises";
const escape = (value) =>
  String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
try {
  const report = JSON.parse(await readFile(process.argv[2], "utf8"));
  const walk = (suites) => {
    for (const suite of suites || []) {
      for (const spec of suite.specs || [])
        for (const test of spec.tests || [])
          for (const result of test.results || [])
            if (["failed", "timedOut"].includes(result.status)) {
              const message = (result.errors || [])
                .map((e) => e.message || String(e))
                .join("\n")
                .replace(/\u001b\[[0-9;]*m/g, "")
                .slice(0, 12000);
              console.log(
                `::error title=${escape(spec.title)}::${escape(message || "Browser test failed without an error message.")}`,
              );
            }
      walk(suite.suites);
    }
  };
  walk(report.suites);
} catch (error) {
  console.log(
    `::warning title=Browser report::${escape("Structured browser report unavailable: " + error.message)}`,
  );
}
