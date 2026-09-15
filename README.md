# Timesheet Fiori Prototype

Clickable prototype of project time recording, designed as a Fiori extension on SAP BTP, with recording read into CATS. Serves as a visual and functional reference for development and for client conversations.

Documents that accompany this repository:

- UX/UI Specification, 23 sections, from principles to acceptance criteria
- Annex A, mapping the interface to SAP concepts and CATSDB fields

## What the prototype does

Everything below works, with no server and no real data.

**Recording**
- Weekly grid with inline editing, accepts `1.5`, `1:30` and `90m`, rounded to 15 minutes
- Calendar view (7 days) with project blocks and external events to convert
- Quick add with natural language interpretation and correctable chips
- Copy previous week (pulls the real previous week's rows once one exists in the sample), apply template, favorites per project
- Week navigation (arrows or `←`/`→`) across four sample weeks: a posted week, one submitted and in approval, the current draft, and an upcoming one with an empty grid

**Absences, read from the leave request**
- An approved full-day absence closes that day to time entry, in both the grid and the calendar
- A partial absence reduces day capacity and the week's expected total
- A pending request raises a warning, doesn't block
- The `Simulate approval` button shows the conflict that arises when a request is approved after hours were already recorded, with assisted resolution
- Suggestions that fall on days with an approved absence aren't proposed

**Conversational assistant, Joule pattern**
- Recording by conversation, checking the week's status, checking absences, copying the week, applying suggestions, submitting
- Interpreted by Claude (`api/chat.js`, function calling), with the browser's regex interpreter as an automatic fallback when the key isn't configured or the call fails
- Never saves without explicit confirmation, and always shows the receiver object and activity type before saving
- Refuses days with an approved absence and proposes the next free day
- Entries created by the assistant are marked with origin `Joule`

**Validation and approval**
- Three severities: error blocks, warning doesn't block, info guides
- Summary per project and receiver object before submission
- Approval screen with bulk approval and exceptions singled out

**CATS mapping**
- Field-by-field table, state chain through to transfer
- Live generation of CATS records from the filled week, as a table or as a payload

## Structure

```
body.html      page content, single source of truth for the markup
styles.css     color and typography tokens, light and dark theme
app.js         all the logic, no external dependencies
index.html     the complete document, what Vercel serves  (generated)
artifact.html  the same page without the shell, to publish as an Artifact  (generated)
tools/build.py generates the two files above from body.html
api/chat.js    optional serverless function, off by default
vercel.json    static site configuration
```

After editing `body.html`, run:

```bash
python3 tools/build.py
```

## Running locally

The page needs no build and no dependencies:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`python3 -m http.server` only serves static files, it doesn't run `api/chat.js`. In that mode the assistant always falls back to the local regex interpreter, which is enough to review the rest of the application. To test the Claude connection locally, run `vercel dev` (needs `@anthropic-ai/sdk` installed with `npm install` and `ANTHROPIC_API_KEY` in the environment).

## Publishing to Vercel

The project is mostly static, with a serverless function at `api/chat.js`. Import the repository into Vercel and accept the defaults, no framework preset, no build command, with the root as the output directory. `vercel.json` already carries that configuration. Set `ANTHROPIC_API_KEY` in the project's environment variables to enable the Claude-powered assistant.

## Data

There's no real data. Employee, projects, WBS, cost centers and absences are made up and live as constants at the top of `app.js`. No request leaves the browser, except what the assistant sends to `api/chat.js` when Claude is enabled (the typed text and the week's context described above). No data is stored, there's no local storage and no cookies.

## Known limits, by design

- Week navigation is simulated, there's only one week
- Without `ANTHROPIC_API_KEY` configured, the natural-language interpreter is deterministic, based on regular expressions. It recognizes duration, day and project prefix, and nothing else. See the next section to connect Claude
- Each request to the assistant is independent, with no memory of the previous turn
- There's no authentication or profiles, the user is fixed

## Connecting Claude to the assistant

`api/chat.js` already calls Claude (`claude-opus-5`, function calling) to interpret free text. To enable it:

1. Set the `ANTHROPIC_API_KEY` environment variable on the Vercel project (Settings → Environment Variables)
2. Redeploy

Without the key, the function returns 501 and the client automatically falls back to the browser's regex interpreter, without breaking the demo.

The engine picks one of six closed functions (`registar_horas`, `consultar_semana`, `listar_ausencias`, `copiar_semana`, `aplicar_sugestoes`, `submeter_semana`) based on the context the client sends with every question: the projects the person is allocated to, the week's absences and capacity per day. It never writes to the timesheet, it only returns the function and its arguments; saving and confirmation stay on the client side, exactly as in the local interpreter.

## What's missing for the assistant to be real in an SAP production setting

The prototype demonstrates the interaction pattern, which is the part that needs validation with users. Connected to Claude, it already covers free-text interpretation, closed function calling and per-user grounding. To operationalize it for real in an SAP scenario, three pieces are missing:

1. **Authentication and identity propagation.** XSUAA or IAS with principal propagation through to the S/4HANA API, so that the write happens on the person's behalf and the audit trail is correct
2. **Conversation state.** Short-retention session storage, to keep context across turns without storing history indefinitely. Each request to `api/chat.js` is currently independent, with no memory of the previous turn
3. **Evaluation.** A set of test cases with real consultant phrasing, including hard cases, to measure accuracy before opening it up to users

In the SAP scenario, the standard path is to expose these functions as a Joule capability, with Joule Studio on SAP Build, instead of building a bespoke chat inside the application. The advantage is that the user gets a single assistant on the launchpad instead of one per application. This prototype imitates the interaction pattern, not the product.

## Notice

This prototype's assistant is called Assistant and is labeled `Joule pattern`. It is not SAP's Joule, doesn't use SAP's brand or services, and only serves to demonstrate the interaction pattern. When connected to Claude, it's Anthropic that processes the text sent to `api/chat.js`, within the context described above.
