// Generate a disclosed computer-narrated reading season from the actual open textbook.
// macOS say + an explicit FFMPEG executable; no cloud audio service or cloned voice.
import {
  readFile,
  writeFile,
  mkdir,
  stat,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = new URL("../", import.meta.url);
const chapters = [
  "02-the-charity-system",
  "03-depth-from-relief-to-source",
  "04-evidence-and-its-grades",
  "05-counterfactuals-and-neglect",
  "06-comparing-the-incomparable",
  "08-feedback-and-voice",
];
const folder = new URL("public/audio/", root);
await mkdir(folder, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "charitology-podcast-"));
const episodes = [];
try {
  for (let n = 0; n < chapters.length; n++) {
    const id = chapters[n];
    const raw = await readFile(
      new URL(`src/content/principles/${id}.md`, root),
      "utf8",
    );
    const [, front, body] = raw.split(/^---\s*$/m);
    const title = front.match(/^title: (.+)$/m)[1].replace(/^"|"$/g, "");
    const intro = `Charitology, the science of doing the most good. Principles, episode ${n + 1}: ${title}. This is a computer narrated reading of our open textbook, using the system's standard voice. It is an editorial draft, not a guest interview or a peer reviewed paper. Source links and the full transcript are on charitology dot org. `;
    const ending =
      " End of the reading. Every level of the depth scale is needed. Questions and corrections are welcome on the public repository. The transcript and original sources are linked on the episode page.";
    const speech =
      intro +
      body
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " source link in transcript ")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/[*_`]/g, "")
        .replace(/^[->]\s*/gm, "")
        .replace(/\|/g, ",") +
      ending;
    const textPath = join(temporary, `${n}.txt`);
    const audioPath = join(temporary, `${n}.aiff`);
    await writeFile(textPath, speech);
    execFileSync("/usr/bin/say", [
      "-v",
      "Samantha",
      "-r",
      "175",
      "-f",
      textPath,
      "-o",
      audioPath,
    ]);
    const filename = `principles-${n + 1}.mp3`;
    const output = new URL(filename, folder);
    const stderr = execFileSync(
      process.env.FFMPEG || "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-i",
        audioPath,
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "-id3v2_version",
        "3",
        "-metadata",
        `title=${title}`,
        "-metadata",
        "artist=Charitology · computer narration",
        output.pathname,
      ],
      { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
    );
    const probe = (() => {
      try {
        execFileSync(
          process.env.FFMPEG || "ffmpeg",
          ["-hide_banner", "-i", output.pathname],
          { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
        );
      } catch (e) {
        return String(e.stderr);
      }
    })();
    const match = probe.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
    if (!match) throw Error("Missing duration");
    const seconds = +match[1] * 3600 + +match[2] * 60 + +match[3];
    episodes.push({
      id: `principles-${n + 1}`,
      number: n + 1,
      title,
      date: "2026-10-25",
      chapter: id,
      audio: `/audio/${filename}`,
      seconds,
      bytes: (await stat(output)).size,
      narration: "Computer narration using macOS Samantha; no voice cloning.",
      review: "draft",
      description: `A narrated reading of textbook chapter ${+id.slice(0, 2)}. Full transcript and sources accompany the audio.`,
      transcript: body.trim(),
    });
    console.log(`${filename}: ${seconds}s`);
  }
  await writeFile(
    new URL("src/data/podcast.json", root),
    JSON.stringify(
      {
        title: "Charitology: Principles read aloud",
        date: "2026-10-25",
        episodes,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
