# Space Apps 2026: submission form fields

[Slides](demo-slides.md) · [Video script](demo-video.md) · [Project page text](project-description.md) · [Technical note](technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

The form is on the **Project** tab of the team page (**My Team → Project → Edit**). This is the page the judges score. Below is every field in order: what must go in it and what may. Requirements common to all fields (language, link access, rights, AI, deadlines) are in the [formal requirements](formal-requirements.md).

## Summary

| No. | Field | Type | Required |
|---|---|---|---|
| 1 | [Project Name](#1-project-name) | Text | Yes |
| 2 | [High-Level Project Summary](#2-high-level-project-summary) | Text | Yes |
| 3 | [Link to Project Demo](#3-link-to-project-demo) | Link | Yes |
| 4 | [Link to Final Project](#4-link-to-final-project) | Link | Yes |
| 5 | [Detailed Project Description](#5-detailed-project-description) | Text | Yes |
| 6 | [Use of Super Intelligence (SI)](#6-use-of-super-intelligence-si) | Selection from a list | Yes |
| 7 | [NASA Data](#7-nasa-data) | Text | Yes |
| 8 | [Space Agency Partner Data and Other References](#8-space-agency-partner-data-and-other-references) | Text | According to the video, no; according to the originality checkbox, yes |
| 9 | [Two checkboxes](#9-two-checkboxes) | Confirmations | Yes |

The project cannot be submitted until all required fields are filled in. The guide does not list which fields the form marks as required: the "Type" and "Required" columns are compiled from its text and the official video and have not been checked on the form itself. The guide speaks of the link in fields 3 and 4 in the singular.

## Earth Fire Calendar materials map

The form has two link fields (3 and 4). All other materials go in as links inside the text of field 5. This is the team's decision, not a requirement of the guide.

| Field | What goes in | Entry point |
|---|---|---|
| 1. Project Name | `Earth Fire Calendar` | — |
| 2. High-Level Project Summary | Two or three sentences: the problem, what is built, what is still a sample | — |
| 3. Link to Project Demo | **Video** recorded from the [script](demo-video.md) | Public video link that opens without sign-in |
| 4. Link to Final Project | **App** | [Link with the prepared view](#4-link-to-final-project) |
| 5. Detailed Project Description | [Project text](project-description.md#5-detailed-project-description), screenshots and a closing **Materials** block of four links: slide deck, technical note, literature review, repository | Each link goes straight to the file in `submission/docs`; the repository link goes to the README |
| 6. Use of Super Intelligence (SI) | AI-use selections: code and text drafts | — |
| 7. NASA Data | FIRMS and GIBS with the role of each dataset | Links to the NASA product pages |
| 8. Space Agency Partner Data and Other References | Third-party data, libraries and licences; the literature review as the supporting source | The same link to the review file as in field 5 |
| 9. Two checkboxes | Tick both | — |

How a judge reaches each material:

| Material | Main entry | Other entries |
|---|---|---|
| Video | Field 3 | — |
| App | Field 4 | Slides 5 and 7, README |
| [Seven-slide](demo-slides.md) deck, PDF in the repository | First link of the Materials block in field 5 | README |
| [Technical note](technical-note.md), draft | Second link of the Materials block | Slide 6, README |
| [Literature review](modis-viirs-harmonization-literature-review.md) | Third link of the Materials block | Field 8, technical note |
| Code | Fourth link of the Materials block | The README is the table of contents for the whole set |

Not checked on the live form: whether field 5 accepts clickable links and images. If it does not, the Materials addresses go in as plain text.

## 1. Project Name

**Required:** the project name.

**Optional:** the guide recommends a short name that makes clear what problem the project solves or what people get from it.

## 2. High-Level Project Summary

**Required:** a brief description answering the guide's three questions:

- what you developed;
- how it addresses the challenge;
- why it matters.

**Optional:** the official video recommends 50–200 words. This is a recommendation, not a limit.

## 3. Link to Project Demo

**Required:** a public link to a demo in **one** of two formats.

| Format | Limit | What it must contain, according to the guide |
|---|---|---|
| Video | No longer than 30 seconds | A brief summary of the idea and a showing of the final project itself, including the software or device created |
| Slides | No more than seven, including title and introductory slides | The same, plus the team name, the members' names and the chosen challenge |

Exceeding the limit makes the project ineligible for global judging; the guide names no separate penalty for the content of the demo. All slides count toward the limit: the title slide, the team slide, slides with links and sources. Video and slides cannot be uploaded to the Space Apps site. The official video names the limit and public access to the demo as a condition for a global award.

**The link may point to:**

- a video on YouTube;
- a file on Google Drive, OneDrive or Dropbox;
- a file in a GitHub repository;
- any other external site, cloud service or code repository: the guide ends the list with "etc.".

Both options are ready for Earth Fire Calendar: the [video script](demo-video.md) and the [slide text](demo-slides.md). The video goes in the field; the deck is linked from field 5 ([materials map](#earth-fire-calendar-materials-map)).

## 4. Link to Final Project

**Required:** a public link to the final project.

**The link may point to:**

- a website created to present the project (we treat a working web application as belonging here too — this is our reading);
- a code repository, for example on GitHub;
- a cloud storage service: a folder or file on Google Drive, OneDrive, Dropbox;
- a video on YouTube;
- another similar platform: the list in the guide is open-ended.

A code repository is one of the options, not a requirement.

For Earth Fire Calendar this field takes the link to the app with the prepared view ([why](advice.md#project-page-and-repository)):

`https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0`

The [repository](https://github.com/avbelkin/nasa-space-apps-sg) is named in the detailed description.

## 5. Detailed Project Description

**Required:** a detailed description. The guide's questions:

- what exactly the project does;
- how it works;
- what benefit it brings;
- what you hope to achieve;
- which tools, programming languages, hardware and software were used.

**Optional** (these questions appear only in the official video):

- what impact you expect;
- what makes the project original;
- which factors were considered, for example energy use, accessibility, cost.

**May be inserted in the text:** links to [supporting materials](#supporting-materials) and [images](#images-on-the-page).

## 6. Use of Super Intelligence (SI)

**Required:** state whether SI tools were used in preparing the solution and how. According to the official video, you tick every applicable option in the drop-down list; if AI was not used, the option is "I did not use SI".

**What counts as SI.** The guide and the FAQs include machine learning, chatbots and conversational assistants, large language and foundation models, image and video generation, and code-generation tools. A project with a machine-learning model, or code written with an assistant, falls under this definition.

The judges are not shown this answer: it is collected for data purposes only. It therefore does not replace the [AI disclosures in the project itself](formal-requirements.md#ai-use).

## 7. NASA Data

**Required:** name in detail the NASA data and resources used. At least one NASA dataset or resource is a condition of eligibility for a global award; the guide does not call its absence an automatic exclusion from global judging.

For Earth Fire Calendar:

| Resource | What exactly | Role |
|---|---|---|
| NASA FIRMS | `MODIS_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` | Core data |
| NASA GIBS | The app requests GPM IMERG and VIIRS Black Marble directly. The VIIRS imagery in the cloud layer arrives already as part of the Extremum layer; it is the credit in the app itself that names NASA GIBS as its source | Context layers |

The repository README lists EPIC and EONET endpoints; the interface does not use them, so do not list them in this field.

## 8. Space Agency Partner Data and Other References

**Required:** list all data, resources and tools of the project, including any code, text and images used — even open or freely available ones. The official video calls the section optional, but the second checkbox obliges you to list all external resources in it. The same video requires all links in this section to be public.

**Optional:** data and resources from partner space agencies; the guide strongly recommends using them. The 2026 partners:

- Angola National Space Programme Management Office;
- Bahrain Space Agency;
- Brazilian Space Agency;
- CSA (Canadian Space Agency);
- ESA (European Space Agency);
- ISRO (Indian Space Research Organisation);
- Italian Space Agency;
- JAXA (Japan Aerospace Exploration Agency);
- KASA (Korea AeroSpace Administration);
- Mohammed Bin Rashid Space Center of the United Arab Emirates;
- National Space Activities Commission of Argentina;
- Nigeria's National Space Research and Development Agency;
- Paraguayan Space Agency;
- Senegalese Space Studies Agency;
- Spanish Space Agency;
- Turkish Space Agency;
- UK Space Agency.

Data from agencies not on this list is ordinary third-party material and is subject to the [license requirements](formal-requirements.md#rights-sources-and-licenses). This is our inference from the participant terms, not a quotation.

For Earth Fire Calendar, list with licenses:

- the EOX Sentinel-2 cloudless basemap (Copernicus Sentinel);
- EUMETSAT, NOAA and JMA cloud imagery and the VIIRS polar mosaic via Extremum;
- CelesTrak orbital elements, including the fallback sets hard-coded in the source;
- the bright-star catalogue for the star background: the code names the source as "Bright Star / Hipparcos"; confirm the exact provenance with the author; Hipparcos is a catalogue of ESA, a partner agency;
- the NASA GIBS precipitation colour scale, ported into the code;
- interface libraries: MapLibre GL JS (BSD-3-Clause), React (MIT), Vite (MIT), TypeScript (Apache-2.0); licenses as recorded in `ui/package-lock.json`;
- the server side: .NET 10 and ASP.NET Core;
- hosting: GitHub Pages and Google Cloud Run.

## 9. Two checkboxes

**Required:** tick both. The full texts are given in the judging guide:

- the first: you have read and understood the requirements of the Project Submission Guide and agree to the participant terms and the privacy policy;
- the second, **Confirm All Work is Original**: the project is the team's original work; all external resources (code, text, images, including open and free ones) are listed in the References field; the team has not used copyrighted material it has no permission to use.

## Images on the page

**Optional:** upload or insert JPG, PNG or GIF images of up to 10 MB directly on the project page. The guide does not specify which fields accept them or whether the limit applies to each file. Videos and documents cannot be uploaded to the page: they are hosted on an external service and linked.

## Supporting materials

**Optional:** provide links to a presentation, video and "other visual aids" — that is how the guide puts it. It does not say where exactly to put such links or how many there may be. Our reading: the limits from field 3 apply only to the demo, and the place for additional links is the detailed description (field 5) or the page that the link in field 4 leads to.

Below is which 2025 winners' materials are available now, according to our review of their public pages. Whether the judges saw them, which field a link was in and whether a material was part of the original submission has not been established: some appeared after the competition. The list is not exhaustive.

The demo itself, as found: slides only — Twisters (6) and Gaia+LEO (7); video only, about 30 seconds — PureFlow, A Solar Tale, Henry's Farm Adventures, QUEÑARIS; the SpaceGenes+ demo did not open.

| Type of material | Who had it |
|---|---|
| Both slides and video (which of them was in the demo field has not been established) | Resonant Exoplanets, Astro Sweepers, AakashNet |
| Technical report (16 pages) | Resonant Exoplanets |
| Long video walkthrough of the interface (about 116 seconds) and a video brochure | AakashNet |
| A separate technical video from the current site (about 42 seconds) | Astro Sweepers |
| Code repository | AakashNet (two), Gaia+LEO, Henry's Farm Adventures, PureFlow, A Solar Tale; Resonant's repository link is shown in its video and no longer opens |
| Interactive result: story, game, configurator, scenario model | A Solar Tale, Henry's Farm Adventures, PureFlow, Gaia+LEO (the model is in the code and was not run) |
| Project website | SpaceGenes+, QUEÑARIS, Resonant Exoplanets, Astro Sweepers, PureFlow, Henry's Farm Adventures, A Solar Tale. The Twisters site was down at the time of the review: the domain had expired |
| Business and legal documents: executive summary, five-year business plan, financial model, revenue and pricing model, one-page business model, an agreement with NASA on the use of the DAS software, a document in the form of an auditor's report for the future years 2026–2028 | Astro Sweepers |
| Sample output report (a one-page demo country report) | Astro Sweepers |
| Technical files: workbooks, CSV, DAS project file and log, screenshots | Astro Sweepers |
| Folder of external reference PDFs (standards, guides) | Astro Sweepers |
| Bibliography of local sources | QUEÑARIS |
| Description of the design process: the author's UX case study, written after the win, and a FigJam board that did not open | SpaceGenes+ |
| Image folder on Google Drive (linked from the project page, not saved) | Twisters |

Which of these materials are worth preparing is covered in the [advice](advice.md#layers-of-materials).

## Form buttons

| Button | What it does |
|---|---|
| **Edit** | Opens the project page for editing |
| **Lock** | Tells the team that the page is being edited. Another member can remove the lock and overwrite unpublished changes, so edits are coordinated within the team |
| **Save Progress** | Saves a draft. The project is **not submitted** by this: only the team sees the changes |
| **Submit for Judging** | Sends the project to the judges. A confirmation banner appears after clicking |

The guide says the judges review the "last saved submission"; the official video says the "last submission". The official screenshot of the form shows the **Last Saved** and **Last Submitted** timestamps separately. So after any edit, click **Submit for Judging** again and make sure the status is **Project Submitted for Judging** and the time in both timestamps matches. Next to the buttons there is a **Close** link; the guide does not describe it.

Sources: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/), and the [official video](https://www.youtube.com/watch?v=CV7AYfMRyMM) — read through its automatic captions, so information from the video is less reliable than the guide.
