import { fundingWorkspaces } from "./partner-funding";
import { advisoryWorkspaces } from "./partner-advisory";
import {
  source,
  select,
  text,
  area,
  date,
  type PartnerWorkspace,
} from "./partner-types";
export type { ProgramField } from "./partner-types";
export const programWorkspaces: Record<string, PartnerWorkspace> =
  Object.fromEntries(
    Object.entries({ ...fundingWorkspaces, ...advisoryWorkspaces }).map(
      ([id, config]) => [
        id,
        {
          ...config,
          collections: [
            ...config.collections,
            {
              key: "readiness",
              label: "Institutional readiness and outside authorization",
              singular: "readiness check",
              description:
                "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
              fields: [
                text("title", "Requirement"),
                text("owner", "Responsible role", true),
                select("status", "Readiness record", [
                  "Not established",
                  "Needs outside review",
                  "Evidence recorded locally",
                  "Needs revision",
                ]),
                source(),
                date("date", "Next check", true),
                area(
                  "notes",
                  "Evidence, authority and what remains unconfirmed",
                ),
              ],
              sample: config.readiness.map((item) => ({
                title: item.title,
                owner: "Role not appointed",
                status: "Not established",
                source: "",
                date: "",
                notes:
                  item.reason +
                  " Fictional demonstration only; not established.",
              })),
            },
          ],
        },
      ],
    ),
  );
