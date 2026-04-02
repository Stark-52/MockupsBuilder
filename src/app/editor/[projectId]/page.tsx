"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { useEditorStore } from "@/lib/store";
import { DEFAULT_DEVICE } from "@/lib/devices";
import { Project } from "@/lib/types";
import { startMcpBridge, stopMcpBridge } from "@/lib/mcp-bridge";
import { Canvas } from "@/components/editor/Canvas";
import { Toolbar } from "@/components/editor/Toolbar";
import { LeftSidebar } from "@/components/editor/LeftSidebar";
import { RightSidebar } from "@/components/editor/RightSidebar";
import { ScreenBar } from "@/components/editor/ScreenBar";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const setProject = useEditorStore((s) => s.setProject);
  const [loading, setLoading] = useState(true);

  // Start MCP bridge for AI agent communication
  useEffect(() => {
    startMcpBridge();
    return () => stopMcpBridge();
  }, []);

  // Auto-save every 5 seconds
  useEffect(() => {
    const timer = setInterval(async () => {
      const store = useEditorStore.getState();
      if (!store.project) return;
      store._syncToProject();
      const synced = useEditorStore.getState().project;
      if (!synced) return;
      const screen = synced.screens[synced.activeScreenIndex];
      await db.projects.update(synced.id, {
        screens: synced.screens,
        activeScreenIndex: synced.activeScreenIndex,
        elements: screen?.elements ?? [],
        backgroundColor: screen?.backgroundColor ?? "#1a1a2e",
        updatedAt: Date.now(),
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      let project = await db.projects.get(projectId);
      if (!project) {
        // Create new project with screens
        project = {
          id: projectId,
          name: "Untitled Project",
          deviceTarget: DEFAULT_DEVICE.id,
          canvasWidth: DEFAULT_DEVICE.width,
          canvasHeight: DEFAULT_DEVICE.height,
          backgroundColor: "#1a1a2e",
          elements: [],
          screens: [{
            id: crypto.randomUUID(),
            name: "Screen 1",
            deviceTarget: DEFAULT_DEVICE.id,
            canvasWidth: DEFAULT_DEVICE.width,
            canvasHeight: DEFAULT_DEVICE.height,
            backgroundColor: "#1a1a2e",
            elements: [],
          }],
          activeScreenIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } satisfies Project;
        await db.projects.add(project);
      }
      setProject(project);
      setLoading(false);
    }
    load();
  }, [projectId, setProject]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Toolbar onBack={() => router.push("/")} />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Canvas />
          <ScreenBar />
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}
