# Course Authoring

## Build an Adventure

Open **Tutor studio** from the game HUD. Every verified account can teach and learn; a separate tutor account is unnecessary. Choose **New course** or **Start storytelling course**, set its title, summary, and language, then use the visual path to select a level.

Each level binds a concept, prerequisites, 3D theme, activity widget, resources, allotted time, and activity points. Reorder levels with keyboard-accessible controls; prerequisite connections determine eligibility independently of display order. The editor supports branches. Concept prerequisites must also be represented by earlier levels in the learning path.

Choose Workshop, Temple Chase, Racing, or Wrestling. **Preview course** displays the selected scenery and authored tasks without changing learner progress or points. These presets run physical task-driven adventures. Zero allotted seconds means untimed; downloads and decision waiting are excluded from task deadlines.

## Prepare Resources and Tasks

Attach existing resources or add a reading, video, notebook, JavaScript, or drawing resource. Include authored text or a secure external link and a traceable HTTPS source. Text-file import copies tutor-authored content into the saved resource; images/video use external links. Source traceability does not replace expert review or permissions to reuse content.

Write each question's options, answer key, criterion rubric, hint, and explanation. Provide distinct fresh retry questions for the same criteria. A learner who requests help or answers incorrectly must demonstrate independent success on the retry bank. Use **Retry criterion** to map each fresh variant to its original checkpoint question. The runner preserves independently cleared criteria and retries only remaining gaps; repeated success on one criterion cannot clear another. Used variants cannot provide fresh evidence again. Exhaustion permits unlimited practice while asking for a fresh tutor-authored variant before new independent credit.

Practice widgets require a matching resource. The runner offers bounded JavaScript, drawing and downloadable notebooks. Opening a tool or submitting client output does not automatically establish mastery.

## Save, Validate, and Publish

**Save draft** preserves incomplete work. Saves include the revision last read; a newer revision produces a conflict instead of overwriting another session's edits. Reload the saved draft deliberately after preserving any local work.

**Check course** reports missing content, invalid answer keys, unsafe links, broken references, duplicate tasks, incompatible widgets, missing retry coverage, and cyclic prerequisites. Select an issue to find its affected level. Correct all issues before **Publish course**.

Publication creates an immutable numbered snapshot. Editing the draft creates a new revision; publishing it creates a new version. Re-publishing the same revision returns the existing version. Existing enrollments retain their pinned version and evidence; new learners see the latest publication. A blocked older enrollment cannot acquire new tasks by silently switching versions.

## Enter a Published House

Close the studio and open **Course houses**, or select its house in the street. Preview the course, choose **Enroll & enter adventure**, and complete its authored tasks. The directory's saved adventures resume the same version after refresh or sign-in. Four published houses load per district, with navigation for the remaining catalogue.

Activity points are authoritative and awarded once per level. The local tev1 model classifies stored evidence after clearance and selects eligible published levels. It also selects quiz questions from your approved banks and recommends unfinished teaching roles. Completing these quizzes does not certify mastery or prove that a learner trained a storytelling model; practical artifacts and reviewed learning-outcome evaluation remain separate requirements.

## Storage and API

`course_drafts` stores creator ownership, optimistic revisions, and the editable definition. `course_versions` stores fixed published snapshots. `course_enrollments` pins a player to a snapshot; `course_chunks` records immutable responses and assistance. All transitions use the existing PostgreSQL/PGlite adapter and transactions.

| Endpoint                                | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `GET/POST /api/studio/courses`          | List owned drafts or create one from a template   |
| `GET/PUT /api/studio/courses/:id`       | Read/update an owned revision                     |
| `POST /api/studio/courses/:id/validate` | Check a saved revision                            |
| `POST /api/studio/courses/:id/publish`  | Publish a valid immutable version                 |
| `GET /api/courses?offset=0&limit=4`     | Browse published houses                           |
| `GET /api/courses/:id?version=1`        | Read public content with answer keys removed      |
| `POST /api/courses/:id/enroll`          | Enroll explicitly, preserving an existing version |
| `GET /api/learning`                     | List the player's saved adventures                |
| `GET /api/learning/:courseId`           | Restore the current authored checkpoint           |
| `POST /api/learning/:courseId/help`     | Record assistance and reveal authored help        |
| `POST /api/learning/:courseId/answer`   | Store an ordered response and return progress     |

Course saves accept at most 256 KiB; publication validates bounded lists and content sizes. No HTML or learner code is executed. Draft APIs require ownership; player evidence remains private. Public question payloads omit answers, hints, explanations, and rubrics.

## Playing Published Themes

The level's theme chooses Workshop, Temple Chase, Racing, or Wrestling. Its time
budget applies to each delivered section task. A learner explicitly starts a
section after the 3D scene loads; timeout repeats that step rather than the whole
course. Correct independent tasks power action feedback, and level clearance
records activity points before local typed inference selects eligible content.

Learners may pause or choose double/untimed play without changing answer keys,
prerequisites, independent-retry requirements, or rewards. Help still records
pedagogical assistance and requires a fresh independent retry. Confirmed course
checkpoint completion earns a badge; accumulated points unlock cosmetic jackets
from the wardrobe in Course Houses.

## Checked Practice and Course Billboards

JavaScript resources offer three optional server arithmetic checks: embedding parameter counts (`tokens * width`), mean loss (`(a + b + c) / 3`) and a two-component score (`a * b`). Submit one bounded return expression; the server recomputes several fixture inputs and ignores client output. A verified receipt covers that exercise only. Unrestricted code, drawings and imported training metrics remain unverified and never automatically grant mastery.

Course Houses includes billboard submissions. Choose a published course version and one of its published levels; new placements remain pending until a privately assigned moderator approves them. Editing a draft does not move an existing placement to another version. All displays carry an advertisement label; withdrawal removes the placement on the next bounded refresh.

Model selection is recorded before question delivery. Refresh preserves the selected task, and completed criteria remain excluded from independent retries. `/api/learning/:courseId/select` retries a pending local selection without creating another reward.
