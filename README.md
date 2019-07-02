---
title: Nested Dependencies in Frontend
published: true
description: What are nested dependencies, why do they exist, how they can harm frontend development, and what you can do to solve it?
tags: javascript, import-maps, node, rollup
---

So you got this awesome idea and now you want to actually do it. I'm pretty sure you do not want to start from scratch, so let's use existing open source packages.

If you want to play along, all the code is on [github](https://github.com/daKmoR/nested-dependecies-in-frontend).

For our example case, we wanna use lit-element and lit-html.

```bash
mkdir nested-dependecies-in-frontend
cd nested-dependecies-in-frontend
npm install lit-element lit-html@1.0.0 --save-exact
```

> Note: we are using pinned versions on purpose here.

Then we just load both packages in our `main.js`.
```js
import { LitElement } from "lit-element";
import { html } from "lit-html";

console.log(LitElement);
console.log(html);
```

In order to find out how big our app will be, we would like to create a rollup bundle. First, install Rollup:

```bash
npm install -D rollup
```
Then create a `rollup.config.js`
```js
export default {
  input: "main.js",
  output: {
    file: "bundle.js",
    format: "iife"
  },
};
```
Next, add `"build": "rollup -c rollup.config.js && du -h bundle.js"` to our package.json's `scripts` block, so we can easily build the file and output it's file size.
Lets run it via `npm run build` :)

```
(!) Unresolved dependencies
https://rollupjs.org/guide/en#warning-treating-module-as-external-dependency
lit-element (imported by main.js)
lit-html (imported by main.js)
```

Oh! It doesn't work! :sob:

OK, I've heard this one before... We need to add some plugins so that Rollup will understand the way node resolution (i.e. bare module specifiers like `import { html } from 'lit-html'`) works.

```bash
npm i -D rollup-plugin-node-resolve
```

```diff
+ import resolve from "rollup-plugin-node-resolve";
+
   export default {
    input: "main.js",
    output: {
      file: "bundle.js",
      format: "iife"
    },
+  plugins: [resolve()]
  };
```

```bash
$ npm run build
# ...
created bundle.js in 414ms
96K     bundle.js
```

So that seems to work fine. :muscle:

### What Happens if Someone Prefers yarn?

Doing a yarn install and then a build should result in the same output, right?

```bash
$ yarn install
$ yarn build
# ...
created bundle.js in 583ms
124K    bundle.js
```

Wow! That is unexpected - 124K for the `yarn` build vs. 96K for `npm`?
It seems the yarn build contains some extra files... maybe a package was duplicated?

```bash
$ yarn list --pattern lit-*
├─ lit-element@2.2.0
│  └─ lit-html@1.1.0
└─ lit-html@1.0.0
```

Yup, both `lit-html` versions `1.0.0` and `1.1.0` are installed.
The reason is most likely that we pinned `lit-html` to version `1.0.0` in our root dependency when we installed it with the `npm install --save-exact lit-html@1.0.0` command, above.

While `npm` seems to dedupe it fine, I don't feel safe using `npm` because if the dependency tree becomes bigger npm also likes to install nested dependencies.
```bash
$ npm ls lit-element lit-html
├─┬ lit-element@2.2.0
│ └── lit-html@1.0.0  deduped
└── lit-html@1.0.0
```

Also specially when you use some beta (e.g. `0.x.x`) dependencies it becomes very tricky. As in this case [SemVer](https://semver.org/#spec-item-4) says every `0.x.0` release means a [breaking change](https://semver.org/#how-should-i-deal-with-revisions-in-the-0yz-initial-development-phase). This means `0.8.0` is treated as incompatible with `0.9.0`. Therefore even if the APIs you are using would work just fine with both versions you will always get nested dependencies which may break your application silently. e.g. there will be no warning or information on the terminal :scream: 


### How Node Resolution Works

In nodejs, when you import a file using a bare specifier, e.g. `import { LitElement } from "lit-element";` Node's module resolver function gets the string `lit-element`, and begins searching all of the directories listed in `module.paths` for the importing module, which you can inspect like any other value in the node REPL:
```bash
$ node
module.paths
[
  '/some/path/nested-dependencies-in-frontend/node_modules',
  '/some/path/node_modules',
  '/some/node_modules',
  '/node_modules',
]
# unimportant folders are hidden here
```

Basically, node looks into every `node_modules` folder, starting in the module's parent directory and moving up the file tree, until it finds a directory name which matches the module specifier (in our case, `lit-element`). The resolution algorithm always starts at the current module's parent directory, so it's always relative to where you are importing the file from. If we would inspect `module.paths` from within lit-element's directory, we'd see a different list.
```bash
$ cd node_modules/lit-element
$ node
module.paths
[
  '/some/path/nested-dependencies-in-frontend/node_modules/lit-element/node_modules',
  '/some/path/nested-dependencies-in-frontend/node_modules',
  '/some/path/node_modules',
  '/some/node_modules',
  '/node_modules',
]
```

Now we can understand what node's nested dependencies are. Every module can have it's own `node_modules` directory, *ad nauseum*, and imports referenced in that module's files will always look in their closest `node_modules` directory first...

| Pros of Nested Dependencies on Node                                                                | Cons of Nested Dependencies for Frontend                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every package can have their own versions of every dependency                                      | Shipping the same code twice means longer download and processing times                                                                                                                                                                   |
| Packages are not influenced by dependencies of other packages in the application                   | Stuff might break if the same code is imported twice from two different locations (e.g. performance optimizations via [WeakMaps](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap) or singletons) |
| There is no "high fee" to pay for accessing many extra files.                                      | Checking if a file exists is an extra request                                                                                                                                                                                             |
| On the server, you usually do not care too much about how much extra code (in files size) there is | Overall, in short, your site will get slower                                                                                                                                                                                              |

### The Problems
In short, automatic module resolution that prefers nesting may be dangerous for frontend.

- We care about loading and parsing performance
- We care about file size
- Some packages must be singletons (i.e. unique in the module graph) to work properly in our application
  - Examples include `lit-html` and `graphql`
- We should be in full control of what ends up on the client's browser

Node-style module resolution, which was designed for a server-side environment, can turn these concerns into serious issues when adopted in the browser.
<abbr title="In my humble opinion">IMHO</abbr>, even if node resolution makes it technically possible, loading the code for a complex data-grid more than once should never be our goal as frontend developers.


### Solutions

Thankfully, there are solutions to these problems that we can use today, and proposals on the horizon which will altogether eliminate the need for such workarounds in the future.

#### Making it Work Today

Here are some tips to work with bare module specifiers in your front end code today:
- Make sure that the modules in your dependency tree all use similar version ranges of their common dependencies
- Avoid pinning specific package versions (like we did above with `npm i -S lit-html@1.0.0`) wherever possible
- If you're using `npm`:
  - Run `npm dedupe` after installing packages to remove nested duplicates.
  - You can try deleting your `package-lock.json` and do a fresh install. Sometimes it magically helps 🧙‍♂️
- If you're using `yarn`:
  - Consider using [yarn resolutions](https://yarnpkg.com/lang/en/docs/selective-version-resolutions/) to specify your preferred version of any duplicated packages

#### A Look Into the Future

If we could tell the JavaScript environment (i.e. the browser) exactly at which `path` to find the file specified by some string, we would have no need for node-style resolution or programming-time deduplication routines.
We'd write something like this and pass it to the browser to specify which paths mapped to which packages:
```json
{
  "lit-html": "./node_modules/lit-html.js",
  "lit-element": "./node_modules/lit-element.js"
}
```

Using this import map to resolve package paths means there would always only be one version of `lit-html` and `lit-element`, because the global environment already knows exactly where to find them.

Luckily ✨,  this is already a proposed spec called [import maps](https://github.com/WICG/import-maps). And since it's meant for the browser there's no need to do any transformation at all! You just provide the map and you don't need any build step while developing?

Sounds crazy 😜? Let's try it out! :hugs:
> Note: Mind you this is an experimental API proposal, it hasn't been finalized or accepted by implementers.


It currently only works in Chrome 75+, behind a flag.
So enter `chrome://flags/` in the URL bar and then search for `Built-in module infra and import maps` and enable it.
Here is a direct link to it: [chrome://flags/#enable-built-in-module-infra](chrome://flags/#enable-built-in-module-infra).

#### Using Import Maps in the Browser

In order to use an import map, let's create an `index.html` file.
```html
<html lang="en-GB">
<head>
  <script type="importmap">
    {
      "imports": {
        "lit-html": "./node_modules/lit-html/lit-html.js",
        "lit-html/": "./node_modules/lit-html/",
        "lit-element": "./node_modules/lit-element/lit-element.js",
        "lit-element/": "./node_modules/lit-element/"
      }
    }
  </script>
  <title>My app</title>
</head>

<body>
  <crowd-chant>
    <span slot="what">Bare Imports!</span>
    <span slot="when">Now!</span>
  </crowd-chant>

  <script type="module" src="./main.js"></script>
</body>

</html>
```

and adjust the `main.js`.

```js
import { html, LitElement } from "lit-element";

class CrowdChant extends LitElement {
  render() {
    return html`
      <h2>What do we want?</h2>
      <slot name="what"></slot>
      <h2>When do we want them?</h2>
      <time><slot name="when">Now!</slot></time>
    `;
  }
}

customElements.define("crowd-chant", CrowdChant);
```

Save the file then serve it locally by running `npx http-server -o` in the same directory.
This will open [http://localhost:8080/](http://localhost:8080/) where you will see your custom element rendered on screen. :tada:

What kind of black magic is this 🔮? Without any bundlers, tools, or build step, we wrote a componentized app with the kind of bare specifiers we've come to know and love.

Lets break it down:
```js
import { html } from 'lit-html';
// will actually import "./node_modules/lit-html/lit-html.js"
// because of
// "lit-html": "./node_modules/lit-html/lit-html.js",

import { repeat } from 'lit-html/directives/repeat.js'
// will actually import "./node_modules/lit-html/directives/repeat.js"
// beacause of
// "lit-html/": "./node_modules/lit-html/",
```

So this means
1. You can import packages directly since the package name is mapped to a specific file
2. You can import subdirectories and files, since `packageName + '/'` is mapped to its directory
3. You must *not* omit the `.js` when importing a file from a subdirectory


#### What Does this All Mean for my Production Build?

It's important to once again note that this is still experimental technology. In any event, you may still want to do an optimized build for production sites using tools like Rollup. We are exploring together what these new APIs will do for our websites and apps. The underlying `import-maps` proposal is still unstable, but that shouldn't stop us from experimenting and extracting utility from it. After all, most of us are comfortable using `babel` to enable experimental syntax like decorators, even though that proposal has at time of this writing at least four flavours.

If you want to try import maps today even in unsupported browsers, you'll need either a build step or a runtime solution like systemjs. For the build-step option, you'll replace the `rollup-plugin-node-resolve` with something that respects your `import map` instead of using node resolution.

And wouldn't it be really nice if you could just point rollup to your `index.html` and have it figure out what your entry points are and if there is an import map?

That's why at [open-wc](https://open-wc.org) we're releasing experimental support for import maps with our `rollup-plugin-index-html`.

And you can read all about it here on dev.to. Watch this space for the announcement 😉.

Follow us on [Twitter](https://twitter.com/openwc), or follow me on my personal [Twitter](https://twitter.com/dakmor).
Make sure to check out our other tools and recommendations at [open-wc.org](https://open-wc.org).

Thanks to [Benny](https://dev.to/bennypowers) and [Lars](https://github.com/LarsDenBakker) for feedback and helping turn my scribbles to a followable story.
