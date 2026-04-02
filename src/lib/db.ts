import Dexie, { type EntityTable } from "dexie";
import { Project } from "./types";

const db = new Dexie("MockupsBuilderDB") as Dexie & {
  projects: EntityTable<Project, "id">;
};

db.version(1).stores({
  projects: "id, name, updatedAt",
});

// v2: migrate flat project structure to screens[]
db.version(2).stores({
  projects: "id, name, updatedAt",
}).upgrade((tx) => {
  return tx.table("projects").toCollection().modify((project: Record<string, unknown>) => {
    if (!project.screens || !Array.isArray(project.screens) || (project.screens as unknown[]).length === 0) {
      project.screens = [{
        id: crypto.randomUUID(),
        name: "Screen 1",
        deviceTarget: project.deviceTarget || "iphone-6.9",
        canvasWidth: project.canvasWidth || 1290,
        canvasHeight: project.canvasHeight || 2796,
        backgroundColor: (project.backgroundColor as string) || "#1a1a2e",
        elements: project.elements || [],
      }];
      project.activeScreenIndex = 0;
    }
  });
});

export { db };
