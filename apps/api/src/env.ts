import dotenv from "dotenv";
import path from "path";

const here = __dirname;
// apps/api/src → monorepo root
const root = path.resolve(here, "../../..");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, "apps", "api", ".env") });
