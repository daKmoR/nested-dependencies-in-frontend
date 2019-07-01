---
title: Nested Dependencies in Frontend
published: false
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

In order to find out how big our app will be, we would like to create a rollup bundle. First install Rollup:

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
Let's run it :)

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


### How Node Resolution Works

So if you do an `import { LitElement } from "lit-element";` then the "resolver" of node gets `lit-element`.
Then it will start to search in all `module.paths` in order.
You can simply check it out by doing in your console
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
Basically it look into every `node_modules` folder up the folder tree starting with the current directory.

This is always relative from where you are importing the file from.
e.g. within `node_modules/lit-element` it looks different
```bash
$ node
module.paths
[
  '/some/path/nested-dependencies-in-frontend/node_modules/lit-element/node_modules',
  '/some/path/nested-dependencies-in-frontend/node_modules',
  '/some/path/node_modules',
  '/some/node_modules',
  '/node_modules',
]
# unimportant folders are hidden here
```

Doing that explains how nested dependencies can be resolved that way.

##### Pros nested dependencies for node
- It means multiple packages each can have their own version of their dependencies
- It means no influenced by dependencies of other parts of your Application
- On the server, you usually do not care too much about how much code (in files size) there is
- There is no "high fee" to pay for accessing many extra files.

#### Cons nested dependencies for the frontend
- Shipping the same code twice means longer download and processing times
- Stuff might break if the same code is imported twice from 2 different locations (e.g. performance optimizations via weak maps or singletons)
- Overall, in short, your site will get slower.


### An automatic resolve that prefers nesting might be dangerous for frontend

- We should care about performance
- We should care about file size
- We sometimes require certain code/packages to be singletons in our application
- We need to be in full control of what ends up on the client's browser

All this is probably problematic when adopting the node magic for the browser.
Imho even if technically possible loading the code for a complex data-grid more than once should never be the goal.


### How can we solve this?

#### Make it work

So what can you do?
- Making sure that you only have similar ranges of dependencies in your dependency tree
- You could not pin version even though it might be a better choice for applications
- npm
    - Running `npm dedupe` will try to find more packages that can potentially dedupe
    - You can try deleting your `package-lock.json` and do a fresh install it sometimes magically helps
- yarn
    - if you have duplicate versions somewhere you could try [yarn resolutions](https://yarnpkg.com/lang/en/docs/selective-version-resolutions/)

#### Look into the future

Potentially a controlled "manual" 1:1 mapping between `package` and `path` could solve this permanently.
You could write something like this and save it.
```json
"lit-html": "./node_modules/lit-html.js",
"lit-element": "./node_modules/lit-element.js"
```

using such a map to resolve package paths means there would always only be one version of lit-html and lit-element.

Luckily there is actually a spec for it and it's called [import maps](https://github.com/WICG/import-maps).
> Mind you that it's an experimental API

It's even meant for the browser - so no need to do any transformation at all??? just provide the map and you don't even need rollup while developing? sounds crazy? let's try it out :hugs:

It currently only works in chrome 75+ and you need to enable a flag.
So enter `chrome://flags/` in the URL bar and then search for `Built-in module infra and import maps` and enable it.
Here is a direct link to it: [chrome://flags/#enable-built-in-module-infra](chrome://flags/#enable-built-in-module-infra).

In order to use it with a browser let's create an `index.html` file.
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
  <script type="module" src="./main.js"></script>
</body>

</html>
```

then serve it by entering `npx http-server -o` in your terminal.
This should open [http://localhost:8080/](http://localhost:8080/) where you should see in your console that the imports actually work. :tada:

What kind of black magic is this? no build step and I can still keep writing bare modules?

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
1. you can import the bare import directly as it is mapped to a specific file
2. you can import subfolders and subfiles as a bare module + '/' as it is mapped to a folder
3. you can NOT omit the `.js` when importing a subfolder/subfile


#### What does that mean for my production build?

> This is very experimental as we are exploring into this direction
> Please be aware that the underlying technology `import-maps` is still unstable

You still want to be able to do optimized production builds.
The only thing is that you probably want to replace is the `rollup-plugin-node-resolve` with something that respects your `import map` instead of using the node resolve.

And actually really nice would be if you could just point to your `index.html` and rollup should figure out what are your entry points and if there is an import map.

We are experimenting with it and added this detection in `rollup-plugin-index-html`.

So let's install it
```bash
yarn add --dev rollup-plugin-index-html
```

and adjust our `rollup.config.js`
```js
import indexHTML from "rollup-plugin-index-html";

export default config => ({
  input: "./index.html",
  output: {
    dir: "dist", // replaced file as we now output at least one index.html and one js file
    format: "esm" // replaced iife as we also generate an index.html which then loads the es module bundle
  },
  plugins: [indexHTML(config)]
});
```

This will output a folder you can throw on any web server (be it apache, express, ...).
It will work in all evergreen browsers.
If you need to support older browsers as well you will need more transpilations and polyfills and you will want to have a differential loading system I would say.
We also offer ready-made configuration for it see [https://open-wc.org/building/building-rollup.html](https://open-wc.org/building/building-rollup.html).

## What's Next?

We will continue to explore the capabilities of `import maps`.
For example, the feature to fully control all the imports that happen within an application.
We will look into if we can utilize that capability to hotfix a dependency next time.


Follow us on [Twitter](https://twitter.com/openwc), or follow me on my personal [Twitter](https://twitter.com/dakmor).
Make sure to check out our other tools and recommendations at [open-wc.org](https://open-wc.org).
