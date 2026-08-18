import { v4 as uuid } from "uuid";
import type {
  Project,
  Environment,
  Test,
  TestRun,
  Step,
} from "@flowguard/shared";

const now = () => new Date().toISOString();

class MemoryStore {
  projects = new Map<string, Project>();
  environments = new Map<string, Environment>();
  tests = new Map<string, Test>();
  runs = new Map<string, TestRun>();

  createProject(name: string): Project {
    const id = uuid();
    const project: Project = {
      id,
      name,
      createdAt: now(),
      updatedAt: now(),
    };
    this.projects.set(id, project);
    return project;
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    variables?: Record<string, string>
  ): Environment {
    const id = uuid();
    const env: Environment = {
      id,
      projectId,
      name,
      baseUrl,
      variables,
      createdAt: now(),
      updatedAt: now(),
    };
    this.environments.set(id, env);
    return env;
  }

  listEnvironments(projectId: string): Environment[] {
    return Array.from(this.environments.values()).filter(
      (e) => e.projectId === projectId
    );
  }

  getEnvironment(id: string): Environment | undefined {
    return this.environments.get(id);
  }

  createTest(projectId: string, name: string): Test {
    const id = uuid();
    const test: Test = {
      id,
      projectId,
      name,
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.tests.set(id, test);
    return test;
  }

  listTests(projectId: string): Test[] {
    return Array.from(this.tests.values()).filter(
      (t) => t.projectId === projectId
    );
  }

  getTest(id: string): Test | undefined {
    return this.tests.get(id);
  }

  updateSteps(testId: string, steps: Step[]): Test | undefined {
    const test = this.tests.get(testId);
    if (!test) return undefined;
    test.steps = steps;
    test.updatedAt = now();
    this.tests.set(testId, test);
    return test;
  }

  createRun(testId: string, environmentId: string): TestRun {
    const id = uuid();
    const run: TestRun = {
      id,
      testId,
      environmentId,
      status: "queued",
      stepsResults: [],
      createdAt: now(),
    };
    this.runs.set(id, run);
    return run;
  }

  getRun(id: string): TestRun | undefined {
    return this.runs.get(id);
  }

  updateRun(id: string, patch: Partial<TestRun>): TestRun | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    Object.assign(run, patch);
    this.runs.set(id, run);
    return run;
  }

  listRuns(testId?: string): TestRun[] {
    const all = Array.from(this.runs.values());
    return testId ? all.filter((r) => r.testId === testId) : all;
  }
}

export const store = new MemoryStore();
