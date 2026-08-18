export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "FlowGuard API",
    version: "0.1.0",
    description:
      "Codeless browser test automation API. Auth via Bearer JWT or X-API-Key. When USE_DATABASE=false, auth is disabled for local MVP.",
  },
  servers: [{ url: "http://localhost:3001", description: "Local" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: {
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    time: { type: "string" },
                    uptimeSec: { type: "number" },
                    auth: { type: "string" },
                    database: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        summary: "Register",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Error" } },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Token + user" }, "401": { description: "Invalid" } },
      },
    },
    "/api/projects": {
      get: {
        summary: "List projects",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        responses: { "200": { description: "Array of projects" } },
      },
      post: {
        summary: "Create project",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/projects/{id}": {
      get: {
        summary: "Get project",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Project" }, "404": { description: "Not found" } },
      },
      put: {
        summary: "Update project",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        summary: "Delete project",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" } },
      },
    },
    "/api/tests/{id}/runs": {
      post: {
        summary: "Start test run",
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Run queued" } },
      },
    },
  },
} as const;
