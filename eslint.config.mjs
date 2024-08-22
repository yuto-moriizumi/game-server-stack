import pluginJs from "@eslint/js";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  { ignores: ["cdk.out", "jest.config.js"] },
  pluginJs.configs.recommended,
  ...tsEslint.configs.recommended
);
