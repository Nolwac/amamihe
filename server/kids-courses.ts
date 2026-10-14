import type {
  CourseDefinition,
  CourseQuestion,
  Theme,
} from "../shared/course.js";
import type { Database } from "./db.js";
import { publishMaintainedCourse } from "./pilot-course.js";
import { KIDS_COURSES } from "../shared/catalogue.js";
import { playableCourses } from "./playable-courses.js";

type Challenge = [
  prompt: string,
  choices: string[],
  answer: number,
  hint: string,
  explanation: string,
];
type Chapter = {
  title: string;
  concept: string;
  lesson: string;
  questions: Challenge[];
  retries: Challenge[];
};
function course(
  title: string,
  summary: string,
  theme: Theme,
  source: string,
  chapters: Chapter[],
): CourseDefinition {
  const question = (
    id: string,
    item: Challenge,
    retryFor?: string,
  ): CourseQuestion => ({
    id,
    prompt: item[0],
    options: item[1],
    answer: item[2],
    hint: item[3],
    explanation: item[4],
    rubric:
      "Credit the concept only for an independent correct answer. Help requires a fresh authored alternative; movement and points do not prove learning.",
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
        id: `draw-${i}`,
        title: c.title + " sketchbook",
        kind: "drawing" as const,
        content:
          "Draw your own example of this discovery. Explain your picture to a helper or write a sentence. Drawing is optional practice; the independent challenge checks the learning.",
        url: "",
        source,
      },
    ]),
    levels: chapters.map((c, i) => ({
      id: `level-${i}`,
      title: c.title,
      conceptId: `concept-${i}`,
      prerequisites: i ? [`level-${i - 1}`] : [],
      theme,
      worldStyle:
        theme === "workshop"
          ? "garden"
          : theme === "temple-chase"
            ? "story-trail"
            : "pattern-track",
      timeLimitSeconds: 0,
      points: 10,
      resourceIds: [`journal-${i}`, `draw-${i}`],
      widget: "quiz",
      questions: c.questions.map((q, j) => question(`question-${i}-${j}`, q)),
      retryQuestions: c.retries.map((q, j) =>
        question(`retry-${i}-${j}`, q, `question-${i}-${j}`),
      ),
    })),
  };
}
/** Original, finite starter material. Ages guide course choice, never account profiling. */
export function kidsCourses(): { id: string; definition: CourseDefinition }[] {
  return [
    ...playableCourses(),
    {
      id: KIDS_COURSES[0].id,
      definition: course(
        "Number Garden",
        "Ages 3–5 · English · 10–15 minutes with a grown-up. Count seeds, discover shapes and fill a garden in a calm 3D workshop. No reading prerequisite: a helper can read each short prompt. Unlimited practice, no task deadline.",
        "workshop",
        "https://www.thecorestandards.org/Math/Content/K/CC/",
        [
          {
            title: "Seed counting",
            concept: "Count small groups",
            lesson:
              "Welcome to Number Garden! Touch or point at each seed once as you count: 1, 2, 3. The last number says how many seeds there are. Do not count the same seed twice. Garden mission: count a small group of real toys, then sketch your own seed patch. Grown-up: read the short questions aloud, let the learner point, and ask how they counted. These are original Amamihe examples; the linked counting framework is background reading for helpers.",
            questions: [
              [
                "Count these seeds: ● ● ●. How many?",
                ["2", "3", "4"],
                1,
                "Point to each dot just once.",
                "There are three seeds: count 1, 2, 3.",
              ],
              [
                "One seed and one more seed. How many now?",
                ["1", "3", "2"],
                2,
                "Use one finger, then add one finger.",
                "One and one make two seeds.",
              ],
            ],
            retries: [
              [
                "Count these flowers: ✿ ✿ ✿ ✿. How many?",
                ["4", "2", "3"],
                0,
                "Point to each flower once.",
                "There are four flowers: 1, 2, 3, 4.",
              ],
              [
                "Two seeds get one more seed. How many now?",
                ["4", "3", "2"],
                1,
                "Start with two fingers and add one.",
                "Two and one make three seeds.",
              ],
            ],
          },
          {
            title: "Shape stepping stones",
            concept: "Recognize circles and triangles",
            lesson:
              "A circle is round, with no corners. A triangle has three straight sides and three corners. Our garden path uses round ponds and triangle flags. Trace a circle in the air, then draw a triangle flag in the sketchbook. A grown-up can help find these shapes nearby; touching shapes and drawing are practice, not automatic challenge credit.",
            questions: [
              [
                "Which shape is round with no corners?",
                ["Triangle △", "Square □", "Circle ○"],
                2,
                "Think about the edge of a round plate.",
                "A circle is round and has no corners.",
              ],
              [
                "Which flag shape has three corners?",
                ["Triangle △", "Circle ○", "Square □"],
                0,
                "Count the corners with your finger.",
                "A triangle has three corners and three sides.",
              ],
            ],
            retries: [
              [
                "Which shape matches a round pond?",
                ["Square □", "Circle ○", "Triangle △"],
                1,
                "A pond can have a smooth round edge.",
                "A round pond matches a circle.",
              ],
              [
                "A shape has three straight sides. What is it?",
                ["Circle ○", "Square □", "Triangle △"],
                2,
                "Count three sides and three corners.",
                "Three straight sides make a triangle.",
              ],
            ],
          },
        ],
      ),
    },
    {
      id: KIDS_COURSES[1].id,
      definition: course(
        "Story Trail",
        "Ages 6–8 · English · 15–20 minutes. Read a tiny original story, follow clues and cross a 3D adventure trail. Practise rhymes and story order. Early readers can use a helper or optional device read-aloud. No task deadline.",
        "temple-chase",
        "https://www.thecorestandards.org/ELA-Literacy/RL/1/",
        [
          {
            title: "The lost seed",
            concept: "Recall story events in order",
            lesson:
              "Original Amamihe story: Ada found a seed beside the path. First, she put it in a pot. Next, she watered it. Last, a green shoot appeared. Ada smiled and moved the pot into the light. Trail mission: imagine the three events as stepping stones. Tell the story in your own words, or sketch the first and last event. Look back at the story when you need help; independent challenge credit needs a fresh question after an explanation.",
            questions: [
              [
                "What did Ada do first with the seed?",
                ["Watered a shoot", "Put it in a pot", "Picked a flower"],
                1,
                "Find the sentence that begins First.",
                "First, Ada put the seed in a pot.",
              ],
              [
                "What happened after Ada watered the seed?",
                [
                  "A green shoot appeared",
                  "She found a new shoe",
                  "The seed became a stone",
                ],
                0,
                "Read the sentence after Next.",
                "After watering, a green shoot appeared.",
              ],
            ],
            retries: [
              [
                "New story: Kofi picked a book, then read it. What happened first?",
                [
                  "Kofi read the book",
                  "Kofi watered a seed",
                  "Kofi picked a book",
                ],
                2,
                "Find the action before the word then.",
                "Kofi picked the book before reading it.",
              ],
              [
                "New story: Nia tied her shoe, then ran. What happened after tying?",
                ["Nia slept", "Nia ran", "Nia planted a seed"],
                1,
                "Find the action after the word then.",
                "Nia ran after tying her shoe.",
              ],
            ],
          },
          {
            title: "Rhyme bridge",
            concept: "Hear ending sounds",
            lesson:
              "Rhyming words share an ending sound: cat and hat; sun and fun. The first sound can change while the ending stays the same. Trail mission: say the words aloud if you want, listen to their endings and choose the word that belongs on the bridge. A helper can read the choices; no microphone or recording is required. Draw two things whose names rhyme, or invent a short rhyming line.",
            questions: [
              [
                "Which word rhymes with cat?",
                ["Dog", "Hat", "Sun"],
                1,
                "Listen to the ending sound: at.",
                "Cat and hat both end with the at sound.",
              ],
              [
                "Which word rhymes with sun?",
                ["Tree", "Cat", "Fun"],
                2,
                "Say the ending sound: un.",
                "Sun and fun share the un sound.",
              ],
            ],
            retries: [
              [
                "Which word rhymes with log?",
                ["Dog", "Hat", "Sun"],
                0,
                "Listen for the og ending.",
                "Log and dog have the same og ending.",
              ],
              [
                "Which word rhymes with red?",
                ["Moon", "Bed", "Cat"],
                1,
                "Listen to the ed ending.",
                "Red and bed share the ed ending.",
              ],
            ],
          },
        ],
      ),
    },
    {
      id: KIDS_COURSES[2].id,
      definition: course(
        "Pattern Racers",
        "Ages 9–12 · English · 15–20 minutes. Solve number-pattern pit stops and repair robot instructions to power a 3D racing course. Prerequisite: add small whole numbers. Correct independent solutions power boosts; speed does not decide learning credit. No task deadline.",
        "racing",
        "https://www.thecorestandards.org/Math/Content/4/OA/",
        [
          {
            title: "Number-pattern pit stop",
            concept: "Infer and apply an additive rule",
            lesson:
              "A number pattern follows a rule. In 2, 4, 6, 8, each number grows by 2. Check the rule at every step instead of guessing from one pair. Race mission: predict the next checkpoint number and explain the rule. Make a new pattern in your sketchbook and ask someone to continue it. These original Amamihe examples introduce pattern reasoning; they do not claim a school qualification or formal curriculum endorsement.",
            questions: [
              [
                "The checkpoints are 3, 6, 9, 12. What comes next?",
                ["14", "15", "18"],
                1,
                "Compare each pair of neighboring numbers.",
                "The rule adds 3 each time, so 12 + 3 = 15.",
              ],
              [
                "Which rule fits 5, 9, 13, 17 at every step?",
                ["Add 4", "Add 5", "Double the number"],
                0,
                "Find the difference between each pair.",
                "Each difference is 4: 9−5, 13−9 and 17−13.",
              ],
            ],
            retries: [
              [
                "The flags read 4, 8, 12, 16. What comes next?",
                ["18", "24", "20"],
                2,
                "Find the same increase at each step.",
                "The rule adds 4, so the next number is 20.",
              ],
              [
                "Which rule fits 2, 7, 12, 17 at every step?",
                ["Add 4", "Add 5", "Double the number"],
                1,
                "Subtract neighboring values.",
                "Every neighboring pair differs by 5.",
              ],
            ],
          },
          {
            title: "Robot route repair",
            concept: "Predict repeated instructions and debug a route",
            lesson:
              "An algorithm is a clear sequence of instructions. A repeat instruction runs the same steps several times. Repeat move forward twice, three times, means 2 + 2 + 2 = 6 forward moves. To debug, compare the wanted result with what the instructions actually do. Race mission: count each action and repair a wrong route. Draw a route with arrows, then explain why it ends at your chosen pit stop. No code download or external account is needed.",
            questions: [
              [
                "A robot repeats two forward moves three times. How many forward moves?",
                ["5", "6", "3"],
                1,
                "Write one group of two for each repetition.",
                "Three groups of two make 2 + 2 + 2 = 6.",
              ],
              [
                "The robot must move 8 steps. It repeats 2 steps 3 times. What repair works?",
                [
                  "Repeat 2 steps 4 times",
                  "Repeat 2 steps 2 times",
                  "Repeat 3 steps 3 times",
                ],
                0,
                "Count the steps each choice would produce.",
                "Four groups of two give exactly eight steps.",
              ],
            ],
            retries: [
              [
                "Repeat three forward moves twice. How many moves happen?",
                ["5", "9", "6"],
                2,
                "There are two groups of three.",
                "Three plus three is six forward moves.",
              ],
              [
                "A robot needs 9 steps. Which repeat instruction reaches exactly 9?",
                [
                  "Repeat 2 steps 4 times",
                  "Repeat 3 steps 3 times",
                  "Repeat 4 steps 3 times",
                ],
                1,
                "Add the steps in each repeated group.",
                "Three groups of three make nine steps.",
              ],
            ],
          },
        ],
      ),
    },
  ];
}
export async function publishKidsCourses(db: Database) {
  for (const entry of kidsCourses())
    await publishMaintainedCourse(db, entry.id, entry.definition);
}
