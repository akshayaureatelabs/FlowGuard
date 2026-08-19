import { z } from "zod";

export const SelectorSchema = z.object({
  primary: z.string().min(1),
  type: z.enum(["css", "xpath"]).default("css"),
  backups: z.array(z.string()).optional(),
});
export type Selector = z.infer<typeof SelectorSchema>;

export const StepTypeSchema = z.enum([
  "navigate",
  "click",
  "type",
  "clear",
  "select",
  "hover",
  "drag",
  "wait",
  "assert",
  "javascript",
  "screenshot",
  "module",
  "condition",
  "accessibility",
  "visualAssert",
]);
export type StepType = z.infer<typeof StepTypeSchema>;

const BaseStepSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: StepTypeSchema,
  name: z.string().optional(),
  optional: z.boolean().optional(),
  timeoutMs: z.number().positive().optional(),
});

export const NavigateStepSchema = BaseStepSchema.extend({
  type: z.literal("navigate"),
  config: z.object({ url: z.string().min(1) }),
});

export const ClickStepSchema = BaseStepSchema.extend({
  type: z.literal("click"),
  config: z.object({
    selector: SelectorSchema,
    button: z.enum(["left", "right", "middle"]).optional(),
    clickCount: z.number().int().positive().optional(),
  }),
});

export const TypeStepSchema = BaseStepSchema.extend({
  type: z.literal("type"),
  config: z.object({
    selector: SelectorSchema,
    value: z.string(),
    clearFirst: z.boolean().optional(),
  }),
});

export const ClearStepSchema = BaseStepSchema.extend({
  type: z.literal("clear"),
  config: z.object({ selector: SelectorSchema }),
});

export const SelectStepSchema = BaseStepSchema.extend({
  type: z.literal("select"),
  config: z.object({
    selector: SelectorSchema,
    value: z.string(),
  }),
});

export const HoverStepSchema = BaseStepSchema.extend({
  type: z.literal("hover"),
  config: z.object({ selector: SelectorSchema }),
});

export const WaitStepSchema = BaseStepSchema.extend({
  type: z.literal("wait"),
  config: z.object({
    ms: z.number().positive().optional(),
    selector: SelectorSchema.optional(),
    state: z.enum(["visible", "hidden", "attached", "detached"]).optional(),
  }),
});

export const AssertStepSchema = BaseStepSchema.extend({
  type: z.literal("assert"),
  config: z.object({
    assertion: z.enum([
      "urlContains",
      "urlEquals",
      "textContains",
      "textEquals",
      "elementVisible",
      "elementNotVisible",
      "elementEnabled",
      "elementDisabled",
      "attributeEquals",
      "countEquals",
    ]),
    selector: SelectorSchema.optional(),
    expected: z.union([z.string(), z.number(), z.boolean()]),
    attribute: z.string().optional(),
  }),
});

export const JavascriptStepSchema = BaseStepSchema.extend({
  type: z.literal("javascript"),
  config: z.object({
    code: z.string().min(1),
    async: z.boolean().optional(),
  }),
});

export const ScreenshotStepSchema = BaseStepSchema.extend({
  type: z.literal("screenshot"),
  config: z.object({
    fullPage: z.boolean().optional(),
    selector: SelectorSchema.optional(),
  }),
});

export const ModuleStepSchema = BaseStepSchema.extend({
  type: z.literal("module"),
  config: z.object({
    moduleId: z.string().min(1),
    variables: z.record(z.string()).optional(),
  }),
});

export const AccessibilityStepSchema = BaseStepSchema.extend({
  type: z.literal("accessibility"),
  config: z.object({
    standard: z.enum(["wcag2a", "wcag2aa", "wcag21aa"]).default("wcag2aa"),
    selector: SelectorSchema.optional(),
  }),
});

export const VisualAssertStepSchema = BaseStepSchema.extend({
  type: z.literal("visualAssert"),
  config: z.object({
    baselineName: z.string().min(1),
    threshold: z.number().min(0).max(1).optional(),
    selector: SelectorSchema.optional(),
    fullPage: z.boolean().optional(),
  }),
});

export const StepSchema = z.discriminatedUnion("type", [
  NavigateStepSchema,
  ClickStepSchema,
  TypeStepSchema,
  ClearStepSchema,
  SelectStepSchema,
  HoverStepSchema,
  WaitStepSchema,
  AssertStepSchema,
  JavascriptStepSchema,
  ScreenshotStepSchema,
  ModuleStepSchema,
  AccessibilityStepSchema,
  VisualAssertStepSchema,
]);
export type Step = z.infer<typeof StepSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  ownerId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const EnvironmentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  baseUrl: z.string().url().or(z.string().min(1)),
  variables: z.record(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const TestSettingsSchema = z.object({
  browser: z.enum(["chrome", "firefox", "edge", "safari"]).optional(),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  geolocation: z.string().optional(),
  parallel: z.boolean().optional(),
});
export type TestSettings = z.infer<typeof TestSettingsSchema>;

export const TestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  steps: z.array(StepSchema).default([]),
  settings: TestSettingsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Test = z.infer<typeof TestSchema>;

export const ModuleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  steps: z.array(StepSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Module = z.infer<typeof ModuleSchema>;

export const ScheduleSchema = z.object({
  id: z.string(),
  testId: z.string(),
  environmentId: z.string(),
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().positive().optional(),
  cron: z.string().optional(),
  notifyEmail: z.string().optional(),
  notifyWebhook: z.string().optional(),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const StepResultSchema = z.object({
  stepId: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  error: z.string().optional(),
  screenshot: z.string().optional(),
  durationMs: z.number().optional(),
  meta: z.record(z.any()).optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const TestRunSchema = z.object({
  id: z.string(),
  testId: z.string(),
  environmentId: z.string(),
  status: z.enum(["queued", "running", "passed", "failed", "error"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  stepsResults: z.array(StepResultSchema).default([]),
  artifacts: z
    .object({
      video: z.string().optional(),
      finalScreenshot: z.string().optional(),
      visualDiff: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
  createdAt: z.string(),
});
export type TestRun = z.infer<typeof TestRunSchema>;

export const CreateProjectBody = z.object({ name: z.string().min(1) });
export const CreateEnvironmentBody = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  variables: z.record(z.string()).optional(),
});
export const CreateTestBody = z.object({ name: z.string().min(1) });
export const UpdateStepsBody = z.object({ steps: z.array(StepSchema) });
export const CreateRunBody = z.object({ environmentId: z.string().min(1) });
export const CreateModuleBody = z.object({ name: z.string().min(1) });
export const CreateScheduleBody = z.object({
  testId: z.string().min(1),
  environmentId: z.string().min(1),
  intervalMinutes: z.number().int().positive().optional(),
  cron: z.string().optional(),
  notifyEmail: z.string().optional(),
  notifyWebhook: z.string().optional(),
  enabled: z.boolean().optional(),
});
export const UpdateTestSettingsBody = TestSettingsSchema;
