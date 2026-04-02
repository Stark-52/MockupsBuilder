"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { Project } from "@/lib/types";
import { DEFAULT_DEVICE, DEVICES, getDevice } from "@/lib/devices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Copy, FolderOpen, MonitorSmartphone } from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("Untitled Project");
  const [newDevice, setNewDevice] = useState(DEFAULT_DEVICE.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    db.projects.orderBy("updatedAt").reverse().toArray().then(setProjects);
  }, []);

  const createProject = async () => {
    const device = getDevice(newDevice) ?? DEFAULT_DEVICE;
    const project: Project = {
      id: crypto.randomUUID(),
      name: newName || "Untitled Project",
      deviceTarget: device.id,
      canvasWidth: device.width,
      canvasHeight: device.height,
      backgroundColor: "#1a1a2e",
      elements: [],
      screens: [{
        id: crypto.randomUUID(),
        name: "Screen 1",
        deviceTarget: device.id,
        canvasWidth: device.width,
        canvasHeight: device.height,
        backgroundColor: "#1a1a2e",
        elements: [],
      }],
      activeScreenIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.projects.add(project);
    setDialogOpen(false);
    router.push(`/editor/${project.id}`);
  };

  const duplicateProject = async (project: Project) => {
    const dup: Project = {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.projects.add(dup);
    setProjects((prev) => [dup, ...prev]);
  };

  const duplicateAcrossDevices = async (project: Project) => {
    const otherDevices = DEVICES.filter((d) => d.id !== project.deviceTarget);
    const newProjects: Project[] = [];
    for (const device of otherDevices) {
      const scaleX = device.width / (project.canvasWidth || 1290);
      const scaleY = device.height / (project.canvasHeight || 2796);
      const dup: Project = {
        ...JSON.parse(JSON.stringify(project)),
        id: crypto.randomUUID(),
        name: `${project.name} (${device.name})`,
        deviceTarget: device.id,
        canvasWidth: device.width,
        canvasHeight: device.height,
        screens: project.screens.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          deviceTarget: device.id,
          canvasWidth: device.width,
          canvasHeight: device.height,
          elements: s.elements.map((el) => ({
            ...el,
            x: Math.round(el.x * scaleX),
            y: Math.round(el.y * scaleY),
            width: Math.round(el.width * scaleX),
            height: Math.round(el.height * scaleY),
          })),
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.projects.add(dup);
      newProjects.push(dup);
    }
    setProjects((prev) => [...newProjects, ...prev]);
  };

  const deleteProject = async (id: string) => {
    await db.projects.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Mockups Builder</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Project</DialogTitle>
                <DialogDescription>
                  Choose a name and target device for your mockup.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My App Screenshots"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Device</Label>
                  <Select value={newDevice} onValueChange={(v: string | null) => { if (v) setNewDevice(v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVICES.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({d.width}×{d.height})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createProject}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-1">No projects yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first App Store mockup to get started.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const device = getDevice(project.deviceTarget);
              return (
                <div
                  key={project.id}
                  className="group relative rounded-lg border border-border bg-card hover:border-foreground/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/editor/${project.id}`)}
                >
                  {/* Thumbnail */}
                  <div
                    className="h-40 rounded-t-lg flex items-center justify-center"
                    style={{ backgroundColor: project.backgroundColor }}
                  >
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt={project.name}
                        className="h-full w-full object-cover rounded-t-lg"
                      />
                    ) : (
                      <span className="text-xs text-white/50">No preview</span>
                    )}
                  </div>

                  <div className="p-3">
                    <h3 className="text-sm font-medium truncate">{project.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {device?.name ?? project.deviceTarget} · {project.elements.length} elements
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      title="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateProject(project);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      title="Duplicate across all devices"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateAcrossDevices(project);
                      }}
                    >
                      <MonitorSmartphone className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-7 w-7"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(project.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
