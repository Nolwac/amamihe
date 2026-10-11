import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue.js";
import { validateCourse, type CourseDefinition } from "../shared/course.js";
import { storytellingCourse } from "./course-template.js";
import type { Database } from "./db.js";

const owner = "amamihe-curriculum";

/** Publish maintained content without modifying tutor courses or pinned enrollments. */
export async function publishPilotCourse(db: Database) {
  const definition = storytellingCourse();
  const issues = validateCourse(definition);
  if (issues.length)
    throw new Error("The maintained pilot failed publication checks.");
  return db.transaction(async (tx) => {
    // No account or session is created for this reserved content owner.
    await tx.query(
      "INSERT INTO players(id,token,name,outfit) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [owner, randomUUID(), "Amamihe curriculum", "terracotta"],
    );
    await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [owner]);
    const row = (
      await tx.query<{
        owner_id: string;
        revision: number;
        published_version: number | null;
        definition: CourseDefinition;
      }>("SELECT * FROM course_drafts WHERE id=$1", [STORYTELLING_COURSE_ID])
    ).rows[0];
    if (row && row.owner_id !== owner)
      throw new Error("The maintained course ID is occupied.");
    if (row?.published_version && isDeepStrictEqual(row.definition, definition))
      return { id: STORYTELLING_COURSE_ID, version: row.published_version };
    const revision = row ? row.revision + 1 : 1;
    const version = (row?.published_version ?? 0) + 1;
    if (row) {
      await tx.query(
        "UPDATE course_drafts SET definition=$2,revision=$3,published_version=$4,updated_at=now() WHERE id=$1",
        [STORYTELLING_COURSE_ID, JSON.stringify(definition), revision, version],
      );
    } else {
      await tx.query(
        "INSERT INTO course_drafts(id,owner_id,definition,revision,published_version) VALUES($1,$2,$3,$4,$5)",
        [
          STORYTELLING_COURSE_ID,
          owner,
          JSON.stringify(definition),
          revision,
          version,
        ],
      );
    }
    await tx.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES($1,$2,$3,$4)",
      [STORYTELLING_COURSE_ID, version, revision, JSON.stringify(definition)],
    );
    return { id: STORYTELLING_COURSE_ID, version };
  });
}
