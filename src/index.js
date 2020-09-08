const fs = require("fs");
const path = require("path");
const traverse = require("@babel/traverse").default;
const parser = require("@babel/parser");
const { transformFromAstSync } = require("@babel/core");

let ID = 0;

function createAsset(filename) {
  const content = fs.readFileSync(filename, "utf-8");
  const ast = parser.parse(content, {
    sourceType: "module",
  });

  const dependencies = new Array();

  // https://www.digitalocean.com/community/tutorials/js-traversing-ast
  traverse(ast, {
    ImportDeclaration: function ({ node }) {
      dependencies.push(node.source.value);
    },
  });

  const id = ID++;

  const { code } = transformFromAstSync(ast, content, {
    presets: ["@babel/preset-env"],
  });

  return {
    id,
    filename,
    dependencies,
    code,
  };
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];

  for (const asset of queue) {
    asset.mapping = {};

    const dirname = path.dirname(asset.filename);

    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);

      const child = createAsset(absolutePath);

      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = "";

  graph.forEach((mod) => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];
        function localRequire(name) {
          return require(mapping[name]);
        }
        const module = { exports : {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(0);
    })({${modules}})
  `;

  return result;
}

const graph = createGraph("./src/example/entry.js");
const result = bundle(graph);

const buildDirectoryName = "build";

// Create build folder
fs.mkdirSync(buildDirectoryName, { recursive: true });

// Bundle to index.js file
fs.writeFileSync("./build/index.js", result);
