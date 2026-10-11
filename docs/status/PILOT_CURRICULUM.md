# Storytelling Pilot Curriculum

The maintained pilot is published at startup with the stable course address `amamihe-story-model`. The main Model Makers entrance and featured storytelling card open its course preview and version-pinned enrollment. It also appears in the course directory and search portals. Learners no longer need to create and publish the tutor template themselves.

## Learning Path

| Level                 | Learning activity                                         | Practical output                                     |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Corpus preparation    | Verify rights, provenance and document-level splits       | `corpus.jsonl` and provenance records                |
| Byte tokenization     | Encode UTF-8 and construct next-byte input/target windows | Encoding script and inspected windows                |
| Causal architecture   | Trace embeddings, masked blocks and tied projection       | Tensor-shape diagram and mask explanation            |
| Parameter accounting  | Derive the 1,040,768-parameter budget                     | Parameter inventory and checked embedding arithmetic |
| From-scratch training | Run fresh initialization and the optimization loop        | Notebook, losses, `split.json` and `story-model.pt`  |
| Evaluation            | Inspect held-out metrics and generated stories            | Checked mean-loss arithmetic and model report        |

Each level has two primary checkpoint questions and criterion-mapped independent retry questions. These twelve primary questions assess concepts; they do not substitute for the practical outputs. The assignments are predefined course resources. The training notebook executes in learner-owned Python/PyTorch; downloading it or completing a quiz is not evidence of training competence or coherent storytelling. Its twenty-step default checks mechanics rather than model quality.

## Publication and Progress

Startup validates and transactionally publishes the maintained definition. Identical restarts reuse the same publication. Content updates create a new immutable version; existing enrollments retain their version and saved progress. Tutor-owned courses are untouched. The reserved curriculum owner has no account or authenticated session.

The original three-question foundations checkpoint remains explicitly separate, with its own progress entry. It cannot clear any of the pilot's six levels.

## Verification

Regression checks cover automatic publication, repeated startup, public answer-key redaction, preservation of pinned progress and tutor drafts, the actual main entrance, phone enrollment, all six levels, refresh/resume, a server-checked workbench and the notebook download. Production verification requires the six-level publication to exist, independently of the tutor-template tests. Real learner training outputs and learning effectiveness require separate evaluation.

Local validation passed 68 Node checks with one optional external-PostgreSQL skip, seven focused browser journeys and two accessibility journeys. The main-entrance journey completed all twelve primary questions across six levels, restored saved progress, saved a checked practice receipt and downloaded the notebook. Published notebook code also passes Python syntax parsing. The recorded summary is in `evidence/reports/pilot-curriculum.json`.
