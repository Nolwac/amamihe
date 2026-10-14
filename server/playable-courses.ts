import type {
  CourseDefinition,
  CourseQuestion,
  WorldStyle,
} from "../shared/course.js";
import type { WorldTask, CircuitTask } from "../shared/world-task.js";

const fractionOptions = Array.from({ length: 8 }, (_, i) => `${i + 1}/8`);
const circuitOptions = ["Both off", "Only A on", "Only B on", "Both on"];
type Task = {
  prompt: string;
  worldTask: WorldTask;
  answer: number;
  hint: string;
  explanation: string;
};
type Chapter = {
  title: string;
  concept: string;
  lesson: string;
  tasks: Task[];
  retries: Task[];
};
function definition(
  title: string,
  summary: string,
  worldStyle: WorldStyle,
  source: string,
  chapters: Chapter[],
): CourseDefinition {
  const question = (
    id: string,
    t: Task,
    retryFor?: string,
  ): CourseQuestion => ({
    id,
    prompt: t.prompt,
    worldTask: t.worldTask,
    options:
      t.worldTask.kind === "fraction-bridge"
        ? [...fractionOptions]
        : [...circuitOptions],
    answer: t.answer,
    hint: t.hint,
    explanation: t.explanation,
    rubric:
      "Credit only an independently correct physical arrangement. Validate the submitted pieces or relay states; a picture, movement, speed or assistance cannot grant mastery. Revealed solutions require a fresh authored retry.",
    ...(retryFor ? { retryFor } : {}),
  });
  return {
    title,
    summary,
    language: "en",
    concepts: chapters.map((c, i) => ({
      id: `concept-${i}`,
      title: c.concept,
      prerequisites: i ? [`concept-${i - 1}`] : [],
    })),
    resources: chapters.flatMap((c, i) => [
      {
        id: `journal-${i}`,
        title: c.title + " field guide",
        kind: "reading" as const,
        content: c.lesson,
        url: "",
        source,
      },
      {
        id: `drawing-${i}`,
        title: c.title + " planning sketch",
        kind: "drawing" as const,
        content:
          "Sketch a different example and explain why it works. This is optional practice; the independent game challenge supplies the learning evidence.",
        url: "",
        source,
      },
    ]),
    levels: chapters.map((c, i) => ({
      id: `level-${i}`,
      title: c.title,
      conceptId: `concept-${i}`,
      prerequisites: i ? [`level-${i - 1}`] : [],
      theme: "workshop",
      worldStyle,
      timeLimitSeconds: 0,
      points: 10,
      widget: "quiz",
      resourceIds: [`journal-${i}`, `drawing-${i}`],
      questions: c.tasks.map((t, j) => question(`question-${i}-${j}`, t)),
      retryQuestions: c.retries.map((t, j) =>
        question(`retry-${i}-${j}`, t, `question-${i}-${j}`),
      ),
    })),
  };
}
function span(
  prompt: string,
  targets: { numerator: number; denominator: number }[],
  hint: string,
  explanation: string,
): Task {
  return {
    prompt,
    worldTask: {
      kind: "fraction-bridge",
      divisions: 8,
      targets,
      pieces: [1, 2, 3],
    },
    answer:
      targets.reduce((a, t) => a + (t.numerator * 8) / t.denominator, 0) - 1,
    hint,
    explanation,
  };
}
const f = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
});
function circuit(
  prompt: string,
  gate: CircuitTask["gate"],
  goal: boolean,
  initial: [boolean, boolean],
  answer: number,
  hint: string,
  explanation: string,
  fixed?: CircuitTask["fixed"],
): Task {
  return {
    prompt,
    worldTask: {
      kind: "circuit",
      gate,
      goal,
      initial,
      ...(fixed ? { fixed } : {}),
    },
    answer,
    hint,
    explanation,
  };
}

/** Original authored construction and relay puzzles, never a generated or typing curriculum. */
export function playableCourses(): {
  id: string;
  definition: CourseDefinition;
}[] {
  return [
    {
      id: "amamihe-fraction-bridge",
      definition: definition(
        "Fraction Bridge",
        "Ages 8–12 · English · 15–25 minutes. Build safe crossings by combining real eighth-length beams. Learn fraction equivalence and addition through construction; independent solutions complete the bridge. No typing, task deadline or equipment needed.",
        "fraction-bridge",
        "https://www.thecorestandards.org/Math/Content/4/NF/",
        [
          {
            title: "Bridges of eighths",
            concept: "Equivalent fractions",
            lesson:
              "Your river crossing is one whole span divided into eight equal units. A beam marked 1/8 covers one unit; 2/8 covers two. Half a whole is the same length as four eighths: 1/2 = 4/8. Three quarters is six eighths: each quarter is two eighths. Compare the empty target span with the pieces, join beams and test your construction. The guide and sketches are practice; only an independently correct construction earns challenge credit. These are original Amamihe puzzles; the linked framework describes the mathematics, not an endorsement of this game.",
            tasks: [
              span(
                "The river gap is 1/2 of a whole span. Join eighth-length beams to build a crossing of exactly that length.",
                [f(1, 2)],
                "A whole has eight equal units. How many cover half?",
                "Half of eight units is four, so 1/2 = 4/8.",
              ),
              span(
                "A rescue boat needs a 3/4-span landing bridge. Build the equivalent length using the beam tray.",
                [f(3, 4)],
                "Each quarter is two eighths.",
                "Three quarters contains six eighths: 3/4 = 6/8.",
              ),
            ],
            retries: [
              span(
                "Build a new 1/4-span footbridge using eighth-length beams.",
                [f(1, 4)],
                "A quarter is one of four equal parts.",
                "One quarter is two eighths: 1/4 = 2/8.",
              ),
              span(
                "Build a 7/8-span crossing for the next rescue team.",
                [f(7, 8)],
                "Count seven equal eighth units.",
                "Seven eighths covers seven of the eight equal units.",
              ),
            ],
          },
          {
            title: "Join the crossing",
            concept: "Add fractions using a common unit",
            lesson:
              "A crossing can have two adjoining target sections. Convert each section to eighths before combining them. For example, 1/4 is 2/8; adding 1/8 gives 3/8, because the pieces still have the same size. Add numerators for like-sized pieces; do not add denominators. Try several beam combinations, undo a piece if the span is too long, then test the completed crossing. Wrong trials and assisted solutions stay practice; your independent construction supplies the criterion evidence.",
            tasks: [
              span(
                "Join a 1/4-span section and a 3/8-span section. Build their total length as one crossing.",
                [f(1, 4), f(3, 8)],
                "Convert the quarter to eighths before adding.",
                "1/4 + 3/8 = 2/8 + 3/8 = 5/8.",
              ),
              span(
                "The crossing needs 1/2 of a span plus another 1/4. Build the combined length.",
                [f(1, 2), f(1, 4)],
                "Half is four eighths; a quarter is two eighths.",
                "1/2 + 1/4 = 4/8 + 2/8 = 6/8.",
              ),
            ],
            retries: [
              span(
                "A new crossing combines 1/8 and 1/4. Build the total length.",
                [f(1, 8), f(1, 4)],
                "Use eighths for both sections.",
                "1/8 + 1/4 = 1/8 + 2/8 = 3/8.",
              ),
              span(
                "Join 1/8 and 1/2 to make the next crossing.",
                [f(1, 8), f(1, 2)],
                "Half a span covers four eighths.",
                "1/8 + 1/2 = 1/8 + 4/8 = 5/8.",
              ),
            ],
          },
        ],
      ),
    },
    {
      id: "amamihe-circuit-rescue",
      definition: definition(
        "Circuit Rescue",
        "Ages 10–14 · English · 15–25 minutes. Restore a lighthouse and safe maintenance access by operating actual relay switches. Learn AND, OR and XOR logic through a working 3D power board. No typing, electrical equipment or task deadline; the circuit is a simulation.",
        "circuit-yard",
        "https://microbit.org/get-started/first-steps/introduction/",
        [
          {
            title: "Power to the beacon",
            concept: "AND and OR logic",
            lesson:
              "This is a safe game simulation, not instructions for household electricity. A relay input can be on or off. AND powers its output only when both inputs are on. OR powers its output when either input is on, including when both are on. Move the switches and watch their cables and the test lamp; the lamp shows the actual current configuration, not earned credit. Test a solution against the mission before the lighthouse or maintenance hatch is committed. The examples are original Amamihe material; the linked micro:bit introduction is background on programmable inputs and outputs.",
            tasks: [
              circuit(
                "The lighthouse uses an AND relay. Set A and B so its beacon receives power.",
                "and",
                true,
                [true, false],
                3,
                "AND needs both inputs on.",
                "Both inputs must be on for AND to supply power.",
              ),
              circuit(
                "An OR relay feeds the repair line. Shut off its output so the technician can work safely.",
                "or",
                false,
                [true, false],
                0,
                "With OR, either live input still supplies power.",
                "Both inputs must be off to shut off an OR output.",
              ),
            ],
            retries: [
              circuit(
                "Relay A is locked on. Use B to switch off this AND-fed maintenance line.",
                "and",
                false,
                [true, true],
                1,
                "AND stops supplying power if either input is off.",
                "A is on, so switch B off to make the AND output off.",
                { a: true },
              ),
              circuit(
                "Relay A is locked off. Use B to restore power through this OR relay.",
                "or",
                true,
                [false, false],
                2,
                "OR can use the other live path.",
                "Switch B on: OR supplies power when at least one input is on.",
                { a: false },
              ),
            ],
          },
          {
            title: "Smart relay gates",
            concept: "Reason with a fixed input",
            lesson:
              "XOR means exactly one input is on. Both off gives no output, and both on also gives no output. A fixed relay is part of the mission: you cannot change it. Work out what the remaining switch must do, then observe and test the result. Distinguish a test lamp from an accepted mission; an illuminated lamp can be wrong when the goal is safe shutdown. Assisted practice uses a new authored mission before independent credit can be earned.",
            tasks: [
              circuit(
                "The rescue door uses XOR. A is locked on. Set B so exactly one input is on and the door receives power.",
                "xor",
                true,
                [true, true],
                1,
                "XOR needs one input on and the other off.",
                "A is on, so B must be off for the XOR output to be on.",
                { a: true },
              ),
              circuit(
                "The maintenance hatch uses AND. A is locked on. Set B so the output is off before opening the hatch.",
                "and",
                false,
                [true, true],
                1,
                "An AND output is off when one of its inputs is off.",
                "With A locked on, B must be off to stop the AND output.",
                { a: true },
              ),
            ],
            retries: [
              circuit(
                "A different XOR rescue door has A locked off. Set B to supply power.",
                "xor",
                true,
                [false, false],
                2,
                "Exactly one relay must be on.",
                "A is off, so B must be on to make exactly one live input.",
                { a: false },
              ),
              circuit(
                "An AND emergency beacon has A locked on. Set B to restore the beacon's power.",
                "and",
                true,
                [true, false],
                3,
                "Both AND inputs must be on.",
                "A is already on; switch B on to restore the AND output.",
                { a: true },
              ),
            ],
          },
        ],
      ),
    },
  ];
}
