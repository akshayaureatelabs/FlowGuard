import { v4 as uuid } from "uuid";
import { useMongo, getMongo } from "./db.js";
import type { Suite, Dataset, TestVersion, Step, TestSettings } from "@flowguard/shared";

function now() {
  return new Date().toISOString();
}

const mem = {
  suites: new Map<string, Suite>(),
  datasets: new Map<string, Dataset>(),
  versions: new Map<string, TestVersion>(),
};

async function col(name: string) {
  const db = await getMongo();
  if (!db) return null;
  return db.collection(name);
}

function strip(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export const featuresStore = {
  async createSuite(projectId: string, name: string, testIds: string[] = []): Promise<Suite> {
    const s: Suite = {
      id: uuid(),
      projectId,
      name,
      testIds,
      createdAt: now(),
      updatedAt: now(),
    };
    const c = await col("suites");
    if (c) await c.insertOne({ ...s });
    else mem.suites.set(s.id, s);
    return s;
  },

  async listSuites(projectId: string): Promise<Suite[]> {
    const c = await col("suites");
    if (c) {
      return (await c.find({ projectId }).sort({ createdAt: -1 }).toArray()).map(strip) as Suite[];
    }
    return [...mem.suites.values()].filter((s) => s.projectId === projectId);
  },

  async getSuite(id: string): Promise<Suite | undefined> {
    const c = await col("suites");
    if (c) {
      const d = await c.findOne({ id });
      return d ? (strip(d) as Suite) : undefined;
    }
    return mem.suites.get(id);
  },

  async updateSuite(
    id: string,
    patch: { name?: string; testIds?: string[] }
  ): Promise<Suite | undefined> {
    const c = await col("suites");
    if (c) {
      const r = await c.findOneAndUpdate(
        { id },
        { $set: { ...patch, updatedAt: now() } },
        { returnDocument: "after" }
      );
      return r ? (strip(r) as Suite) : undefined;
    }
    const s = mem.suites.get(id);
    if (!s) return undefined;
    const next = { ...s, ...patch, updatedAt: now() };
    mem.suites.set(id, next);
    return next;
  },

  async deleteSuite(id: string): Promise<boolean> {
    const c = await col("suites");
    if (c) {
      const r = await c.deleteOne({ id });
      return r.deletedCount > 0;
    }
    return mem.suites.delete(id);
  },

  async createDataset(
    projectId: string,
    name: string,
    columns: string[] = [],
    rows: Record<string, string>[] = []
  ): Promise<Dataset> {
    const d: Dataset = {
      id: uuid(),
      projectId,
      name,
      columns,
      rows,
      createdAt: now(),
      updatedAt: now(),
    };
    const c = await col("datasets");
    if (c) await c.insertOne({ ...d });
    else mem.datasets.set(d.id, d);
    return d;
  },

  async listDatasets(projectId: string): Promise<Dataset[]> {
    const c = await col("datasets");
    if (c) {
      return (await c.find({ projectId }).sort({ createdAt: -1 }).toArray()).map(
        strip
      ) as Dataset[];
    }
    return [...mem.datasets.values()].filter((d) => d.projectId === projectId);
  },

  async getDataset(id: string): Promise<Dataset | undefined> {
    const c = await col("datasets");
    if (c) {
      const d = await c.findOne({ id });
      return d ? (strip(d) as Dataset) : undefined;
    }
    return mem.datasets.get(id);
  },

  async updateDataset(
    id: string,
    patch: { name?: string; columns?: string[]; rows?: Record<string, string>[] }
  ): Promise<Dataset | undefined> {
    const c = await col("datasets");
    if (c) {
      const r = await c.findOneAndUpdate(
        { id },
        { $set: { ...patch, updatedAt: now() } },
        { returnDocument: "after" }
      );
      return r ? (strip(r) as Dataset) : undefined;
    }
    const d = mem.datasets.get(id);
    if (!d) return undefined;
    const next = { ...d, ...patch, updatedAt: now() };
    mem.datasets.set(id, next);
    return next;
  },

  async deleteDataset(id: string): Promise<boolean> {
    const c = await col("datasets");
    if (c) {
      const r = await c.deleteOne({ id });
      return r.deletedCount > 0;
    }
    return mem.datasets.delete(id);
  },

  async saveVersion(
    testId: string,
    steps: Step[],
    settings?: TestSettings,
    label?: string
  ): Promise<TestVersion> {
    const v: TestVersion = {
      id: uuid(),
      testId,
      label: label || `v${Date.now()}`,
      steps: JSON.parse(JSON.stringify(steps)),
      settings: settings ? JSON.parse(JSON.stringify(settings)) : undefined,
      createdAt: now(),
    };
    const c = await col("testVersions");
    if (c) await c.insertOne({ ...v });
    else mem.versions.set(v.id, v);
    return v;
  },

  async listVersions(testId: string): Promise<TestVersion[]> {
    const c = await col("testVersions");
    if (c) {
      return (
        await c.find({ testId }).sort({ createdAt: -1 }).limit(50).toArray()
      ).map(strip) as TestVersion[];
    }
    return [...mem.versions.values()]
      .filter((v) => v.testId === testId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  },

  async getVersion(id: string): Promise<TestVersion | undefined> {
    const c = await col("testVersions");
    if (c) {
      const d = await c.findOne({ id });
      return d ? (strip(d) as TestVersion) : undefined;
    }
    return mem.versions.get(id);
  },
};
