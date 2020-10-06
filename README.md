# Mini CSS themes webpack plugin

Generates themes for webpack css modules based setup. Requires [mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin) 
as it depends on it to generate the different themes css files. Currently it supports only
SASS.

## Installation

1. Install npm package:
    ```bash
    npm i --save mini-css-themes-plugin
    ```
2. Add plugin in webpack.
    ```js
    const MiniCssThemesWebpackPlugin = require('mini-css-themes-plugin');
    // ...
    module.exports = {
       plugins: [
         new MiniCssThemesWebpackPlugin({
            themes: {
                'theme_one': './path/to/theme_one/theme.scss',
                'theme_two': './path/to/theme_two/theme.scss',
            },
            defaultTheme: 'theme_one'
         })  
       ]
    };
    ```
3. By default use imports to the default theme in all css modules: ex /path/to/theme_one/theme.scss
in this example.

## How it works

The plugin will duplicate all css modules imports found in js modules for each non default theme.
These duplicates will then have their own compilation and a special loader will change the default
theme path import in scss files. Finally new chunk is generated for each non default theme.

With the installation example and with two entrypoints you will have the following additional 
chunks asset outputs:
- theme__theme_two~entrypoint_1.hash.css
- theme__theme_two~entrypoint_2.hash.css

This plugin is not providing the loading mechanism of these themes. You will have to write that 
yourself. Considering that you also have the webpack manifest plugin:

```typescript
const defaultTheme: string = 'theme_one';
const selectedTheme: string = 'theme_two';

// Here manifest is the loaded manifest.json.
const loadThemes: (entrypoint: string) => Array<Promise<any>> = (entrypoint) => 
  Object.keys(manifest)
    .filter((file: string) =>  {
      if (selectedTheme !== defaultTheme) {
        // There can be multiple chunks for same theme for this entry.
        return file.indexOf(`theme__${selectedTheme}~${entrypoint}`) === 0 && file.match(/\.css$/)
      } else {
        return file.indexOf(entrypoint) === 0 && file.match(/\.css$/)
      }
    })
    // addCss should take care of loading the css file in the DOM.
    .map((file: string) => addCss(manifest[file]));

Promise.all([
  ...loadThemes('entrypoint_1'),
]).then(() => {
  // ... proceed to render your application ...
});
```

## Limitations

1. You must use the theme imports only in css modules. So for example the following is not 
possible since the plugin cannot detect the theme import and do the switch.

```sass
// MyComponent.scss
@import './something/not/from/the/theme.scss'
```

```sass
// ./something/not/from/the/theme.scss
// This import won't be switched when generating the themes and will remain the
// same values in all themes.
@import './path/to/theme_one/theme.scss'
$myOtherVar: $themeVar1 + $themeVar2
```

2. Currently the plugin won't include plain `.css` imports from your sources or from under
node modules into the separate themes. Since these are not themable anyway it is advised
to separate this css imports in their own files (common chunks) and then load them for all 
themes. This is good for caching and theme file size overall.
