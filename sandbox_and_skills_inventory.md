# Sandbox Programs and Example Skills Inventory

Date of inventory: Sunday, October 4, 2026

**Corrections from the earlier message:** Python has 130 packages, not 132. The 132 counted two header lines. The filter was also narrow, so scripts in /usr/local/bin point to more packages (camelot, img2pdf, fonttools, flask, mkdocs, magika, markdownify, marko).

**Link status key**
- **Verified:** found in a web search during this check.
- **Earlier note:** from the earlier inventory, not re-checked here.
- **Not found:** searched, no matching public repository located.
- **None known:** no public repository identified.

---

## Part 1: Sandbox Programs

### LibreOffice (`soffice`)
- **Method:** Sandbox program, version 24.2.7.
- **Code:** C++ office suite. Called through `scripts/office/soffice.py` (in the docx and pptx skills). A bare `soffice` hangs in this sandbox.
- **Logic:** Converts Word, PowerPoint and Excel files to PDF, converts legacy .doc files, accepts tracked changes, and recalculates Excel formulas (recalc.py).
- **GitHub:** https://github.com/LibreOffice/core (read-only mirror). Main repo: git.libreoffice.org
- **Link status:** Earlier note.

### pandoc
- **Method:** Sandbox converter, version 3.1.3.
- **Code:** Haskell.
- **Logic:** `pandoc -t markdown file.docx` reads Word as Markdown. `--track-changes=accept` accepts edits but leaves emptied paragraphs.
- **GitHub:** https://github.com/jgm/pandoc
- **Link status:** Earlier note.

### pdftotext
- **Method:** Sandbox tool from Poppler 24.02.0.
- **Code:** C++.
- **Logic:** `pdftotext -layout in.pdf out.txt` keeps columns. `-f` and `-l` select pages. Returns nothing for scanned PDFs.
- **GitHub:** None. Poppler is hosted at https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### pdftoppm
- **Method:** Sandbox tool from Poppler.
- **Code:** C++.
- **Logic:** Renders PDF pages to JPEG or PNG (`pdftoppm -jpeg -r 100 in.pdf page`). Used to check Word, PowerPoint and PDF output visually.
- **GitHub:** None. Poppler: https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### pdfimages
- **Method:** Sandbox tool from Poppler.
- **Code:** C++.
- **Logic:** `pdfimages -list` shows raster images. `-j` extracts them as JPEGs. Vector charts don't appear.
- **GitHub:** None. Poppler: https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### pdfinfo
- **Method:** Sandbox tool from Poppler.
- **Code:** C++.
- **Logic:** Prints page count, file size, PDF version and metadata. First step of the pdf-reading inventory.
- **GitHub:** None. Poppler: https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### pdffonts
- **Method:** Sandbox tool from Poppler.
- **Code:** C++.
- **Logic:** Lists fonts in a PDF. An empty table means a scan with no text layer, so OCR is needed. Fonts marked "emb: no" with custom encodings can produce garbled text.
- **GitHub:** None. Poppler: https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### pdfdetach
- **Method:** Sandbox tool from Poppler.
- **Code:** C++.
- **Logic:** `pdfdetach -list` shows files embedded in a PDF.
- **GitHub:** None. Poppler: https://gitlab.freedesktop.org/poppler/poppler
- **Link status:** Earlier note.

### qpdf
- **Method:** Sandbox tool, version 11.9.0.
- **Code:** C++.
- **Logic:** Merges (`qpdf --empty --pages a.pdf b.pdf -- out.pdf`), splits by page range, rotates, and removes passwords when given one.
- **GitHub:** https://github.com/qpdf/qpdf
- **Link status:** Earlier note.

### Tesseract
- **Method:** Sandbox OCR engine, version 5.3.4. Called from Python through pytesseract, with pdf2image for page images. Only English (eng) and orientation (osd) data are installed.
- **Code:** C++ engine, Python wrappers.
- **Logic:** Renders each PDF page to an image, runs `image_to_string`, joins the text. Other languages need extra data not installed here.
- **GitHub:**
  - Tesseract: https://github.com/tesseract-ocr/tesseract
  - pytesseract: https://github.com/madmaze/pytesseract
  - pdf2image: https://github.com/Belval/pdf2image
- **Link status:** Earlier note.

### ffmpeg
- **Method:** Sandbox tool for audio and video, version 6.1.1.
- **Code:** C.
- **Logic:** Converts, trims, extracts audio and makes GIFs. No read skill calls it directly. imageio-ffmpeg (0.6.0) bundles its own copy for the Slack GIF skill.
- **GitHub:** https://github.com/FFmpeg/FFmpeg (mirror). Official home: git.ffmpeg.org
- **Link status:** Earlier note.

### ImageMagick (`convert`)
- **Method:** Sandbox command-line tool, version 6.9.12. The newer `magick` command is not installed.
- **Code:** C.
- **Logic:** Resizes, crops and converts image formats from the shell. Inside scripts, Pillow or OpenCV is used instead.
- **GitHub:**
  - ImageMagick 7.x: https://github.com/ImageMagick/ImageMagick
  - ImageMagick 6.x (the version installed here): https://github.com/ImageMagick/ImageMagick6
- **Link status:** The 6.x repo was **verified** (the ImageMagick 6 manual page names it as the source repository). The 7.x link is an earlier note.

### git
- **Method:** Sandbox tool, version 2.43.0.
- **Code:** C.
- **Logic:** Clones public repos from allowed hosts and commits locally. No credentials have been provided, so only public repos can be read.
- **GitHub:** https://github.com/git/git
- **Link status:** Earlier note.

### curl
- **Method:** Sandbox tool, version 8.5.0.
- **Code:** C.
- **Logic:** Fetches from allowed hosts only. Other hosts are blocked by the proxy, which returns a reason header.
- **GitHub:** https://github.com/curl/curl
- **Link status:** Earlier note.

### extract-text
- **Method:** Command in /usr/local/bin.
- **Code:** Not visible. Help text says it extracts plain text from docx, odt, epub, xlsx, pptx, rtf, html and ipynb.
- **Logic:** `extract-text <path>`, with `--format` for unusual extensions. Markdown for docx, odt and epub; tab-separated rows for xlsx; "Slide N" blocks for pptx.
- **GitHub:** **Not found.** The search returned other tools with similar names (dextract, textract, GroupDocs, redact-paperasse-cli), none of which matched this command's help text. Its source is not confirmed.
- **Link status:** Not found.

### markitdown
- **Method:** Sandbox command and Python package, version 0.1.5.
- **Code:** Python.
- **Logic:** `markitdown deck.pptx` gives one block per slide with slide-number markers. `markitdown book.xlsx` gives one section per sheet without cell coordinates.
- **GitHub:** https://github.com/microsoft/markitdown
- **Link status:** Earlier note.

### pip
- **Method:** Sandbox package installer.
- **Code:** Python. Command: `pip install <pkg> --break-system-packages`.
- **Logic:** Tries the import first, installs only if it fails. Only PyPI hosts are reachable. `mcp` and `anthropic` are not installed.
- **GitHub:** https://github.com/pypa/pip
- **Link status:** Earlier note.

### npm
- **Method:** Sandbox package installer, npm 10.9.7 with Node 22.22.2.
- **Code:** JavaScript. Global installs go to /home/claude/.npm-global.
- **Logic:** Tries `require` first, installs only if it fails. Registry hosts are on the allow list.
- **GitHub:** https://github.com/npm/cli
- **Link status:** Earlier note.

### Playwright browsers
- **Method:** Preinstalled browsers in /opt/pw-browsers: chromium-1194, chromium_headless_shell-1194, ffmpeg-1011.
- **Code:** Python and Node Playwright, both 1.56.0.
- **Logic:** Opens local HTML in headless Chromium, takes screenshots, reads console errors. `playwright install` is blocked, so the preinstalled chromium-1194 folder is used. (The morning skill names a different path, /opt/pw-browsers/chromium, which is not present here.)
- **GitHub:**
  - Playwright (Node): https://github.com/microsoft/playwright
  - Playwright (Python): https://github.com/microsoft/playwright-python
- **Link status:** Earlier note.

---

## Part 2: Example Skills (31)

Located in /mnt/skills/examples. Readable with `view`, but not in the active skill list.

### 1. algorithmic-art
- **Method:** Instructions plus file writes. No image model.
- **Code:** JavaScript with p5.js 1.7.0 (loaded from cdnjs), HTML and CSS. Files: templates/viewer.html, templates/generator_template.js.
- **Logic:** Writes a short "algorithmic philosophy" .md, then fills in the p5.js algorithm and parameter controls in the fixed template. Seeded randomness. Output is one HTML file.
- **GitHub:**
  - Skill: https://github.com/anthropics/skills (listed in the official repo)
  - p5.js: https://github.com/processing/p5.js
- **Link status:** The anthropics/skills repo was **verified**. Its listing of algorithmic-art is an earlier note.

### 2. artifact-emulator
- **Method:** Instructions plus a Python bootstrap script and a Python Playwright check script, run in the sandbox.
- **Code:** Python. bootstrap.py uses the standard library. The check script uses Playwright (sync API) over CDP. Designed for cloud Cowork (Chromium, bun, curl). Not run here.
- **Logic:** Runs bootstrap once per session, serves artifact files, takes a screenshot, reads console errors. Stops with a one-line reason if a step fails.
- **GitHub:** Skill not found. Playwright for Python: https://github.com/microsoft/playwright-python
- **Link status:** Skill repo **not found**. Playwright link is an earlier note.

### 3. benepass-reimbursement
- **Method:** Browser, Gmail connector and file upload. None are in this chat.
- **Code:** None.
- **Logic:** Gathers receipt details, logs in to the reimbursement site, fetches the verification code from email, fills in the claim, uploads the receipt, submits. Only the receipt details and wording can be handled here.
- **GitHub:** None known.
- **Link status:** None known.

### 4. brand-guidelines
- **Method:** Instructions only, 73 lines.
- **Code:** None. Values: neutrals #141413, #faf9f5, #b0aea5, #e8e6dc; accents #d97757, #6a9bcc, #788c5d; headings Poppins (Arial fallback), body Lora (Georgia fallback).
- **Logic:** Applies the colors and fonts. Poppler-style sizing: Poppins for headings 24pt and up, Lora for body. Text color depends on background.
- **GitHub:** https://github.com/anthropics/skills (listed in the official repo)
- **Link status:** Repo **verified**. Listing is an earlier note.

### 5. built-in-browser
- **Method:** Instructions for desktop-app browser pane tools (mcp__Claude_Browser__*). Not in this chat.
- **Code:** None.
- **Logic:** Loads tools with ToolSearch, reads pages as text, handles site approvals and access requests. Sign-ins persist to the person.
- **GitHub:** None known.
- **Link status:** None known.

### 6. call-to-book
- **Method:** Instructions needing a phone-calling tool and a calendar tool. Neither is in this chat. Uses ask_user_input_v0, which is available.
- **Code:** None.
- **Logic:** Asks what, where and when. Checks the calendar and travel time, lines up backup times, gathers the business's questions, gets approval before dialing, says it is an AI on the call, adds the booking afterward.
- **GitHub:** None known.
- **Link status:** None known.

### 7. cancel-unsubscribe
- **Method:** Instructions for a destructive "Tier 3" task. Needs research and browser or phone tools that are not here.
- **Code:** None.
- **Logic:** Identifies the service, scans statements for recurring charges, picks the fastest route (online, chat, phone, mail), shows the plan, gets explicit approval, carries it out, confirms.
- **GitHub:** None known.
- **Link status:** None known.

### 8. canvas-design
- **Method:** Instructions plus code written in the sandbox. Fonts ship with the skill.
- **Code:** The skill text names no library. Python with Pillow or reportlab is the likely choice. About 29 bundled TTF font families. Outputs: .md, .pdf, .png.
- **Logic:** Writes a design philosophy in .md, then expresses it on a canvas. Refines rather than adding more. Google Fonts hosts are not on the allow list, so bundled fonts are used.
- **GitHub:**
  - Skill: https://github.com/anthropics/skills (listed in the official repo)
  - Pillow: https://github.com/python-pillow/Pillow
- **Link status:** Repo **verified**. Pillow is an earlier note.

### 9. chrome-browser
- **Method:** Instructions for Claude in Chrome extension tools (mcp__claude-in-chrome__*). Not in this chat.
- **Code:** None.
- **Logic:** Calls tabs_context_mcp first, works in a new tab, closes tabs it opened, follows site permissions, asks when needed. Not for the built-in browser.
- **GitHub:** None known.
- **Link status:** None known.

### 10. computer-use
- **Method:** Instructions for desktop-control tools (mcp__computer-use__*) on macOS or Windows. Not in this chat.
- **Code:** None.
- **Logic:** Requests app access first. Prefers a connector, then a browser tool, then screen control. Browsers are read-only tier. Extra rules for links and financial actions.
- **GitHub:** None known.
- **Link status:** None known.

### 11. deep-research
- **Method:** Instructions for a coordinator that starts subagents (Agent or Task tool). Those tools are not available here, so research is done directly.
- **Code:** None. Reference notes: researcher.md, report-writer.md.
- **Logic:** Clarifies, sets up folders, runs parallel researchers, optionally another round, runs a report writer, delivers the report.
- **GitHub:** Not found.
- **Link status:** Not found.

### 12. doc-coauthoring
- **Method:** Instructions only, 375 lines.
- **Code:** None.
- **Logic:** Three stages: context gathering, refinement and structure (clarify, brainstorm, curate, gap check, draft, iterate), and reader testing.
- **GitHub:** https://github.com/anthropics/skills (listed in the official repo)
- **Link status:** Repo **verified**. Listing is an earlier note.

### 13. docs
- **Method:** A 6-line pointer to a "docs connector."
- **Code:** None.
- **Logic:** Routes all document work to the docs connector. No docs tools are in this chat. Makes shared, editable docs the default for documents someone will keep or share.
- **GitHub:** None known.
- **Link status:** None known.

### 14. event-planning
- **Method:** Instructions using ask_user_input_v0 and research tools.
- **Code:** None.
- **Logic:** Asks the basics, researches 2–3 options for the main decision (usually the venue), confirms cost against budget before any booking, drafts invitations for approval.
- **GitHub:** None known.
- **Link status:** None known.

### 15. file-expenses
- **Method:** Instructions using ask_user_input_v0, plus browser and Gmail that are not here.
- **Code:** None.
- **Logic:** Picks the platform (Benepass, Brex, Concur, Expensify or Ramp), finds receipts, checks for duplicates, shows a summary, hands off login and payment, submits.
- **GitHub:** None known.
- **Link status:** None known.

### 16. file-form
- **Method:** Instructions using ask_user_input_v0, web research, and a browser that is not here.
- **Code:** None.
- **Logic:** Finds the right form or portal for tasks like jury duty, passports, DMV or permits. Prefers online, then phone, mail, or in person. Hands off login, ID checks and payment.
- **GitHub:** None known.
- **Link status:** None known.

### 17. financial-calculator
- **Method:** Instructions only. Math is done by Claude or by Python (pandas, numpy) in the sandbox.
- **Code:** None named in the skill.
- **Logic:** Tax estimates, loan comparisons, rent vs. buy, retirement projections, investment scenarios. Shows work. Not financial advice.
- **GitHub:** None known.
- **Link status:** None known.

### 18. google-workspace
- **Method:** Instructions, Python helper scripts, and Google Drive, Docs, Sheets and Slides connectors (not connected here).
- **Code:** Python standard library only. docs_index.py, sheets_helper.py, slides_helper.py, render_export.py. Per-app notes in references/.
- **Logic:** Reads the app's reference first, checks connectors, uses helpers for Docs positions (UTF-16), Sheets ranges, and Slides geometry (EMU units).
- **GitHub:** None known.
- **Link status:** None known.

### 19. grocery-shopping
- **Method:** Instructions using ask_user_input_v0, plus a delivery site that needs a browser tool not here.
- **Code:** None.
- **Logic:** Builds the list from categories and staples, applies diet limits, checks budget, assembles the cart, hands off checkout.
- **GitHub:** None known.
- **Link status:** None known.

### 20. hire-help
- **Method:** Instructions using ask_user_input_v0, search, and a browser that is not here.
- **Code:** None.
- **Logic:** Searches task marketplaces, shows 2–3 options, hands off login, payment and final confirmation.
- **GitHub:** None known.
- **Link status:** None known.

### 21. internal-comms
- **Method:** Instructions plus four example files: 3p-updates.md, company-newsletter.md, faq-answers.md, general-comms.md.
- **Code:** None.
- **Logic:** Picks the communication type, reads the matching example for the house format, writes the piece.
- **GitHub:** https://github.com/anthropics/skills (listed in the official repo)
- **Link status:** Repo **verified**. Listing is an earlier note.

### 22. learn
- **Method:** Instructions only, 78 lines. Changes how Claude teaches.
- **Code:** None.
- **Logic:** Checks prior knowledge, moves one step per turn, holds the line when pushed, uses teaching moves, handles academic-integrity cases.
- **GitHub:** None known.
- **Link status:** None known.

### 23. mcp-builder
- **Method:** Instructions, reference guides and two Python scripts.
- **Code:** connections.py uses the `mcp` package. evaluation.py uses the `anthropic` package. Requires anthropic 0.39.0+ and mcp 1.1.0+, neither installed here. Guides cover Python (FastMCP) and Node/TypeScript.
- **Logic:** Research and plan, implement, review and test (py_compile), write XML evaluations and run evaluation.py (needs an API key, not available here).
- **GitHub:**
  - Skill: https://github.com/anthropics/skills (listed in the official repo)
  - Python SDK: https://github.com/modelcontextprotocol/python-sdk
  - TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- **Link status:** Repo **verified**. SDK links are earlier notes.

### 24. meal-delivery
- **Method:** Instructions using ask_user_input_v0, plus a delivery app in a browser that is not here.
- **Code:** None.
- **Logic:** Works back from the arrival time (calendar if an event is named), suggests 2–3 restaurants, proposes an order, gets approval, places the order.
- **GitHub:** None known.
- **Link status:** None known.

### 25. paint
- **Method:** Instructions plus a bundled Python toolkit, run in the sandbox. No image model.
- **Code:** Python with OpenCV and NumPy. Files: paintkit/toolkit.py (Canvas class), render.py, examples/full_scene.py, reference.md. OpenCV 4.13 is installed.
- **Logic:** Writes scene.py, renders a half-size seeded preview, fixes the two worst issues, renders 1600×900 final output. Not for charts, diagrams or UI mockups.
- **GitHub:**
  - Skill: Not found.
  - OpenCV: https://github.com/opencv/opencv
- **Link status:** Skill **not found**. OpenCV is an earlier note.

### 26. prescription-refill
- **Method:** Instructions for a reversible "Tier 2" action, using ask_user_input_v0 and phone or browser tools not here.
- **Code:** None.
- **Logic:** Confirms exactly what to refill (required gate), gathers pharmacy details, refills by the fastest route. Medication details are not stored in memory and are requested each time.
- **GitHub:** None known.
- **Link status:** None known.

### 27. return-refund
- **Method:** Instructions using ask_user_input_v0, web research, and phone or browser tools not here.
- **Code:** None.
- **Logic:** Identifies the item and retailer, finds the return policy, offers the best path (online, in store, phone), handles shipping labels.
- **GitHub:** None known.
- **Link status:** None known.

### 28. setup-writing-style
- **Method:** Instructions plus one Python script that reads your own writing.
- **Code:** stylometry.py, standard library only. Self-test must print "selftest OK."
- **Logic:** Asks consent, collects samples (sent mail, Slack posts, Drive docs, pasted text), builds a voice profile with no personal data, saves it as a skill. Saving a skill needs a mechanism not visible in this chat.
- **GitHub:** None known.
- **Link status:** None known.

### 29. slack-gif-creator
- **Method:** Instructions plus bundled Python modules, run in the sandbox.
- **Code:** Python with Pillow 12.1.1, ImageIO 2.37.3, imageio-ffmpeg 0.6.0, NumPy 2.4.4. Modules: core/gif_builder.py, frame_composer.py, easing.py, validators.py.
- **Logic:** Slack sizes are 128×128 for emoji and 480×480 for messages. Draws frames with PIL, applies easing, saves optimized, validates with validate_gif and is_slack_ready.
- **GitHub:**
  - Skill: https://github.com/anthropics/skills (listed in the official repo)
  - Pillow: https://github.com/python-pillow/Pillow
  - ImageIO: https://github.com/imageio/imageio
- **Link status:** Repo **verified**. Pillow and ImageIO are earlier notes.

### 30. theme-factory
- **Method:** Instructions plus 10 theme files and a showcase PDF.
- **Code:** None. Themes are Markdown files with hex colors and font pairs.
- **Logic:** Shows the 10 themes (arctic-frost, botanical-garden, desert-rose, forest-canopy, golden-hour, midnight-galaxy, modern-minimalist, ocean-depths, sunset-boulevard, tech-innovation). Applies the chosen one, or creates a new theme.
- **GitHub:** https://github.com/anthropics/skills (listed in the official repo)
- **Link status:** Repo **verified**. Listing is an earlier note.

### 31. web-artifacts-builder
- **Method:** Instructions plus two shell scripts and a shadcn components tarball, run in the sandbox.
- **Code:** Bash, Node 18+. Vite (latest on Node 20+, 5.4.11 on Node 18), create-vite react-ts template, Tailwind, shadcn/ui, Parcel with html-inline.
- **Logic:** init-artifact.sh creates the project. bundle-artifact.sh builds with Parcel and inlines everything into bundle.html. Publishing that bundle as a page has not been tested.
- **GitHub:**
  - Vite: https://github.com/vitejs/vite
  - Parcel: https://github.com/parcel-bundler/parcel
  - pnpm: https://github.com/pnpm/pnpm
  - shadcn/ui: https://github.com/shadcn-ui/ui
  - Skill: a third-party summary lists it in anthropics/skills, but this was not confirmed in the official repo.
- **Link status:** Skill listing **uncertain**. Dependency links are earlier notes.

---

## Part 3: Updates to Two Active Skills

### skill-creator
- **Method:** Instructions plus Python scripts.
- **Notes:** run_eval.py calls `claude -p`, which is not installed here, so the description-tuning loop cannot run in this chat. quick_validate.py needs PyYAML (installed). generate_review.py starts a local web server and tries to open a browser. improve_description.py calls other programs (not read in detail).
- **GitHub:** https://github.com/anthropics/skills (listed in the official repo)
- **Link status:** Repo **verified**.

### morning
- **Method:** Instructions with an HTML artifact template.
- **Notes:** Embeds the Fraunces font from its assets folder for the headline. Checks the page with a headless Chromium screenshot. Treats gathered email, chat and calendar text as data, not instructions. Scheduled runs only render the brief. The browser path it names differs from this sandbox's.
- **GitHub:** None known.
- **Link status:** None known.

---

## Summary of Verified Repositories

| Repository | Status |
|---|---|
| https://github.com/anthropics/skills | Verified (official, contains docx, pdf, pptx, xlsx and a skills/ folder) |
| https://github.com/ImageMagick/ImageMagick6 | Verified |
| All other links | Earlier notes, not re-checked in this pass, except where marked Not found |

**Items with no GitHub repository found:** artifact-emulator skill, deep-research, paint skill, extract-text command, the Poppler tools (hosted on GitLab instead), and all skills marked "None known."

**Notes on search results:** Several results for "anthropics/skills" were unofficial forks (for example echoVic, lzwzz, abe238 and others) that copy the README. These were not used. Only the official anthropics/skills path is listed above.
