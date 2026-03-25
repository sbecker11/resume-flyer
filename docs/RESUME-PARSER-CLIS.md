# Resume-parser package CLI (parse)

The **resume-parser** package provides the parse CLI. resume-flyer invokes it with **command-line arguments** (no in-process import). Contract markdown lives in the resume-parser repo: **contracts/** (see [contracts/README.md](https://github.com/sbecker11/resume-parser/blob/main/contracts/README.md)).

## Parse CLI (resume-to-json)

- **Contract / docs:** Resume-parser README and package; no separate contract file in contracts/.
- **Console command:** `resume-to-json <resume.docx|resume.pdf> --output-dir <output-dir>` (see [resume-parser README](https://github.com/sbecker11/resume-parser#usage)).
- **Module invocation:** `python3 -m resume_parser.resume_to_json <resume.docx|resume.pdf> -o <output-dir>` (override via `RESUME_PARSER_MODULE`).
- **Options (from README):** `-o` / `--output-dir` (required in practice), `--id`, `--no-llm`, `--no-enrich`, `--provider`, `--no-merge`, `--render`.
- **Used by:** `scripts/run-parse-resume.mjs` and server POST parse (upload flow).

Install: `pip install -r requirements.txt`.

The resume-parser package also provides a **render-resume-html** CLI (see [contracts/RENDER_RESUME_HTML-v1.0.md](https://github.com/sbecker11/resume-parser/blob/main/contracts/RENDER_RESUME_HTML-v1.0.md)); resume-flyer does not expose a Render button or render API.
