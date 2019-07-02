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


### How Node Resolution Works

So if you do an `import { LitElement } from "lit-element";` then the "resolver" of node gets `lit-element`.
Then it will start to search in all `module.paths` in order.
You can simply check it out by doing in your terminal
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

Now we can understand what node's nested dependencies are. Every module can have it's own `node_modules` directory, *ad nauseum*, and imports referenced in that module's files will always look in their closest `node_modules` directory first..

##### Pros nested dependencies for node
- It means every package can have their own versions of every dependency
- It means packages are not influenced by dependencies of other packages in the application
- On the server, you usually do not care too much about how much extra code (in files size) there is
- There is no "high fee" to pay for accessing many extra files.

#### Cons nested dependencies for the frontend
- Shipping the same code twice means longer download and processing times
- Stuff might break if the same code is imported twice from 2 different locations (e.g. performance optimizations via weak maps or singletons)
- Overall, in short, your site will get slower


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
  <script type="module">
    import { html, LitElement } from 'lit-element';
    customElements.define('crowd-chant', class extends LitElement {
      render() {
        return html`
            <h2>What do we want?</h2>
            <slot name="what"></slot>
            <h2>When do we want them?</h2>
            <time><slot name="when">Now!</slot></time>
        `;
      }
    });
  </script>
  
  <crowd-chant>
    <span slot="what">Bare Imports!</span> 
    <span slot="when">Now!</span>
  </crowd-chant>
</body>

</html>
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


#### What does that mean for my production build?

> This is very experimental as we are exploring into this direction
> Please be aware that the underlying technology `import-maps` is still unstable

You still want to be able to do optimized production builds.
The only thing is that you probably want to replace is the `rollup-plugin-node-resolve` with something that respects your `import map` instead of using the node resolve.

And actually really nice would be if you could just point to your `index.html` and rollup should figure out what are your entry points and if there is an import map.

We are experimenting with it and added this detection in a rollup plugin called `rollup-plugin-index-html`.

So let's install it
```bash
yarn add --dev rollup-plugin-index-html
```

and adjust/replace your `rollup.config.js`
```js
import indexHTML from "rollup-plugin-index-html";

export default config => ({
  input: "./index.html",
  output: {
    dir: "dist",
    format: "esm"
  },
  plugins: [indexHTML(config)]
});
```

We now use:
- a config function instead of an object to pass on the config to the plugin
- an `index.html` instead of `main.js` as an entry point input
- a dir output and an `esm` format as we generate multiple files
- the plugin `rollup-plugin-index-html` instead of `rollup-plugin-node-resolve`

This will output a folder you can throw on any web server (be it apache, express, ...).
It will work in all evergreen browsers.
If you need to support older browsers as well you will need more transpilations and polyfills and you will want to have a differential loading system for better performance.
We offer ready-made configuration for it and you can take a look on our homepage at [https://open-wc.org/building/building-rollup.html](https://open-wc.org/building/building-rollup.html).

## What's Next?

We will continue to explore the capabilities of `import maps`.
For example, the feature to fully control all the imports that happen within an application.
We will look into if we can utilize that capability to hotfix a dependency next time.


Follow us on [Twitter](https://twitter.com/openwc), or follow me on my personal [Twitter](https://twitter.com/dakmor).
Make sure to check out our other tools and recommendations at [open-wc.org](https://open-wc.org).

Thanks to [Benny](https://dev.to/bennypowers) and Lars for feedback and helping turn my scribbles to a followable story.
