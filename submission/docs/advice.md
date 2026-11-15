# Space Apps 2026: advice on the submission and demo

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](../working/form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

This document contains general recommendations only: what raises the score and how best to show a project. It says nothing about our own project; how the advice is applied to Earth Fire Calendar is in the [project notes](../working/project-notes.md). They rest on the official guides and on our review of the 2025 winners. The conclusions drawn from that review are editorial hypotheses based on a sample of winners alone, not the jury's disclosed reasoning. What is mandatory is covered in the [form fields](../working/form-fields.md) and the [formal requirements](formal-requirements.md).

## What the judges score

Each of the five criteria is scored on a **1–5** scale at every level of judging, including local selection. The third column is the guide's description of the top score.

| Criterion | What is assessed | Top score |
|---|---|---|
| **Impact** | A significant problem, broad reach and a convincing benefit for a large audience |
| **Creativity** | A breakthrough approach that has not been tried before and challenges conventional methods |
| **Validity** | A scientifically sound, technically feasible and usable solution that does what it is meant to do, is fully developed and is ready for real-world use |
| **Relevance** | The challenge is addressed fully and directly; NASA data is the foundation of the solution, not a superficial add-on |
| **Presentation** | A clear, well-structured explanation of the challenge, the solution and why it matters |

- In the 2025 instructions to judges, scoring had two steps: first the minimum requirements (language, fit with the challenge, demo limit, link accessibility, NASA data, AI disclosure) — a project failing any of them received a 1 and was not considered further; then a single holistic score from 1 to 5 guided by the criteria. No such instruction for 2026 appears in the official materials we collected.
- **Most of the score rests on the project page**, so attached files do not replace its text. The demo also counts and can raise the Presentation score; for that criterion judges look at both the demo and the whole project.
- The guide asks teams to give Presentation as much attention as the other four criteria and recommends having people with storytelling and design skills on the team.
- A finished product is not required, but the readiness and completeness of the solution affect Validity.

Finalists are nominated for one of ten global awards:

| Award | What it is for, according to the guide |
|---|---|
| Best Use of Science | The best and most valid use of the scientific method |
| Best Use of Data | The project that best makes space data accessible or finds a unique use for it |
| Best Use of Technology | The most innovative use of technology |
| Galactic Impact | The greatest potential to improve life on Earth or in the universe |
| Best Mission Concept | The most plausible concept and design |
| Most Inspirational | The project that captures hearts |
| Best Storytelling | The most creative story about what open data makes possible |
| Global Connection | The project that best connects people around the world through technology |
| Art & Technology | The most successful combination of technical and creative skills |
| Local Impact | The greatest potential to change life in the team's local community |

## Layers of materials

The strongest shared technique in the review of the 2025 winners: the viewer sees the link "a specific user's problem → transformation → visible result". Build the materials in layers so that names, numbers and statuses match across them; in the winners' own materials they did not always agree.

| Layer | Job | What to put there |
|---|---|---|
| Demo | Get the main point across on first viewing | One problem, one action, one visible result |
| Project page | Let the reader study the proposal; the page must make sense without the demo | What was built and how it works; the NASA datasets and the role of each; what runs on live data, what is an estimate and what is planned; limitations; screenshots |
| Documentation in the repository | Answer follow-up questions | Method details, test plan with criteria, known pitfalls |
| Code | Let the implementation be checked | A public repository whose README does not contradict the project page |

The list of materials found among the winners is in [supporting materials](../working/form-fields.md#supporting-materials). There is no need to prepare everything: a technical appendix is useful when it answers the questions left open after the demo and the page. The best example of this separation is Resonant Exoplanets: a short pitch on its own, a technical report on its own.

Practices from the review that make materials verifiable:

- **A traceable example.** Explain why this particular case was chosen for the demonstration, and keep the chain "source data → chosen case → assumptions → result" (Astro Sweepers).
- **Conditions next to the number.** Units, period and measurement conditions sit next to every comparison: Resonant's presentation says 3–8 seconds and its report says 10–40 seconds for the same process.
- **A durable copy.** A year later, three of the winners' links no longer opened: the Resonant repository, the SpaceGenes+ demo and the Twisters site, whose domain had expired. Keep a stable repository and an exported copy of the result alongside the live link.
- **Nothing is taken without rights.** The winners' code, images and text cannot be used just because the project won an award.

## 2025 examples for each criterion

| Criterion | 2025 example |
|---|---|
| **Impact** | Twisters: from the user's question to the decision screen; QUEÑARIS: place → consequence → method → action |
| **Creativity** | Resonant: a named mechanism — memorable, but it proves nothing by itself; SpaceGenes+: one central visualization |
| **Validity** | The Resonant report narrows the pitch's bold claims; for PureFlow, a screen recording does not replace engineering verification |
| **Relevance** | PureFlow names its NASA sources; the review recommends tying each one to a specific calculation or screen |
| **Presentation** | The PureFlow and QUEÑARIS videos; less successful as a short pitch — the Resonant video, the Astro Sweepers video on Google Drive and the long AakashNet dashboard walkthrough |

## Demo: video or slides

The official guide advises choosing the format early, starting from the question "what story does the team want to tell?", assigning one person responsible for the demo, and looking at the Demo section on past winners' pages.

The goal, according to the guide, is to quickly convey the importance and relevance of the project to someone with no context, no technical background and no knowledge of the topic; in either format, strong visuals and readability are needed.

### Rules from the review of the winners

1. **One problem, a visible action, a clear consequence.** In PureFlow's video the main interaction runs from roughly the 7th to the 22nd second.
2. **The result before the feature list.** Twisters' slides lead from the user's question to the result screen; the review recommends showing the result even earlier, before the feature list. Do not give a tour of the layers: AakashNet's 116-second dashboard walkthrough is useful as an appendix, not as a short pitch, and the Astro Sweepers video flips through eight slides in about eight seconds.
3. **A non-trivial case in the key frame.** On Twisters' main screen all indicators read 0%: it shows the interface, not the capability. Choose a frame where the difference is visible at once.
4. **Only what can be read in time goes on screen.** In the Resonant video, pages of the technical report change faster than they can be read. Move the methodology, test plan and limitations to the project page and the repository.
5. **No time is spent on credits and atmosphere.** Astro Sweepers puts the team slide before the benefit; the first 17 seconds of A Solar Tale are mood. Names can go in a caption instead of the voiceover.
6. **Statuses are not mixed.** For QUEÑARIS, the seedlings already grown in the video and the first-year planting target on the site are different quantities, and neither is a measured result. A positive example is the SpaceGenes+ site: it says outright that one case works and the rest is a concept.
7. **Subtitles are proofread.** In the PureFlow video the name DONKI turned into "donkey". Acronyms and product names get mangled easily.
8. **After the first viewing, the viewer can answer four questions:** what the problem is, what was built, what result is visible and why NASA data is needed.

### A structure to check the pitch against

From the same review. It is a checklist for the argument, not a mandatory seven-slide template.

| Part | Question it answers | Minimal evidence |
|---|---|---|
| Problem | Who is affected, where, and which decision is difficult? | One named user situation and a sourced baseline |
| Contribution | What is different about the proposed approach? | One explained transformation or design choice |
| Demonstration | What enters, what happens, what comes out? | One readable example with input and output |
| Validity | Why should the result be trusted within its scope? | A control, comparison or explicit constraint; a known failure mode |
| NASA relevance | What part of the value depends on these resources? | The exact dataset, tool or resource and its role |
| Impact and next step | Who acts on the result, and what remains to be shown? | An adoption path and a clearly labelled future test |

How the winners' decks carried such an argument:

| Approach | Example | What to take |
|---|---|---|
| A user scenario leads to the product | Twisters, slides 1–6 | Begin with a specific decision the user has to make; show the result before listing further capabilities; label an invented dialogue as an illustration |
| The deck answers the judging questions | Resonant Exoplanets, slides 2–7 | Impact, Creativity, Validity, Relevance and Results as a sequence of questions; the slides need not be named after the criteria |
| A social purpose backed by architecture | AakashNet, slides 2–7 | The people and their constraint first, then one system diagram; detailed cost tables go to supporting material |
| A technical result connected to adoption | Astro Sweepers, slides 4–7 | Keep one worked case and the person acting on it central; the full business model stays behind the short argument |

Choosing the form: if the result is visible through an interaction, show the interaction; if the achievement is reasoning about a system, use one diagram and one worked scenario; if local action is central, show the place, the decision and the intervention.

### Other presentation forms among the winners

They are not needed in full for a 30-second demo, but the techniques carry over to the slides and the project page.

| Technique | Example | What to take |
|---|---|---|
| Choice under constraints | Gaia+LEO: decisions, goal, constraints, a recommendation per scenario | Show what can be changed, what must stay feasible and what the example recommends; keep the assumptions next to the result |
| Situation → choice → feedback | Henry's Farm Adventures | One complete episode instead of a description of how it is built; it is clear who it is for |
| Sequential narrative | A Solar Tale: one narrator, concepts introduced gradually | The tone of delivery matches the product itself; each new concept builds on the previous one |

### What not to copy

The winners' materials also contain claims of infallibility and accuracy with no reproducible check, model assumptions presented as discoveries, goals presented as results, forecasts formatted as reporting, agencies named as partners, and arithmetic that does not add up. An award does not confirm a claim. The length of the materials available today is not a guide either: the link between the current files and the original submissions has not been established.

### The official 30-second video outline

| Time | What to say |
|---|---|
| 0:00 | Introduce yourself: your name and the team name |
| 0:02 | Which challenge the project addresses and why it was chosen |
| 0:05 | The project name and a short tagline |
| 0:10 | How it works: images or a prototype, the user experience, the role of open data from NASA and partner agencies |
| 0:20–0:30 | A look ahead: what the solution could give people and the world |

The outline is the guide's advice, not an eligibility condition.

### Official advice on slides

- A template with a readable font size; as few words per slide as possible.
- The images show the project itself, the user experience and how open data and technology from NASA and partner agencies make the solution possible.

Our advice, not official:

- One point and one image per slide; put the methodology and the full bibliography on the project page and in the repository.
- Duplicate the meaning of colour with text or a symbol and keep text contrast at 4.5:1 or higher: these are guidelines from the Space Apps brand guide that are also useful for the styling of a map. The review of SpaceGenes+ specifically notes a second visual cue besides colour.

### Project page

The guide advises saving the project page often so as not to lose work.

**Order of work before the deadline.** First, all the [items marked ⛔](formal-requirements.md#checklist): these include the license information for third-party materials. Then the remaining formal requirements: completeness of sources, AI disclosure. Then what affects the score: separation of statuses on the project page, and names, numbers and statuses that match across the demo, the project page and the README.

Sources: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), [NASA Space Apps Brand Guidelines](https://www.spaceappschallenge.org/brand/), and our own comparison of the 2025 winners' presentation formats and of their recurring arguments.
