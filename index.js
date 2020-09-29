const path = require('path');
const fs = require('fs');

class MiniCssThemesWebpackPlugin {
  constructor(config) {
    this.validate(config);
    this.init(config);
  }

  validate({themes, defaultTheme}) {
    if (!themes) {
      throw new Error(`You must provide the list of themes.`);
    }
    if (!defaultTheme) {
      throw new Error(`You must provide the default theme key.`);
    }
    if (!themes[defaultTheme]) {
      throw new Error(`Default theme '${defaultTheme}' missing from themes definition.`);
    }

    Object.entries(themes).forEach(([themeKey, file]) => {
      const fullPath = path.resolve(file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Theme '${themeKey}' file not found: ${fullPath}`);
      }
    });
  }

  init({themes, defaultTheme, chunkPrefix}) {
    this.pluginName = this.constructor.name;
    this.themes = themes;
    this.defaultTheme = defaultTheme;
    this.chunkPrefix = chunkPrefix || 'theme__';

    this.defaultImportFilename = path.basename(this.themes[this.defaultTheme]).replace(/\.[a-zA-Z0-9]+$/, '');
    this.nonDefaultThemeKeys = Object.keys(this.themes).filter(t => t !== this.defaultTheme);
    this.themeChunkNames = this.nonDefaultThemeKeys.map(theme => `${this.chunkPrefix}${theme}`);

    this.absolutePathThemes = {};
    Object.entries(themes).forEach(([key, themePath]) => this.absolutePathThemes[key] = path.resolve(themePath));
  }

  apply(compiler) {
    const filterThemeChunks = chunks => chunks.filter(chunk =>
      this.themeChunkNames.find(c => chunk.chunkReason && chunk.chunkReason.indexOf(`(cache group: ${c})`) !== -1)
    );

    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // Finds import dependencies targeted to sass files and duplicates them for each theme.
      compilation.hooks.succeedModule.tap(this.pluginName, module => {
        const findSassDependencies = () => module.dependencies.filter(dep => dep.request && dep.request.match(/\.scss$/));

        const cloneDependencyForTheme = (theme, dep) => {
          const cloneDependency = Object.assign(Object.create(Object.getPrototypeOf(dep)), dep);
          // Mark for which theme we are cloning the sass dependency.
          cloneDependency.themed = theme;
          // Need to modify the identifier so that it is recorded as a separate dependency.
          // Otherwise webpack will consider them the same deps and not attempt creating
          // different modules for them.
          const oldGetResourceIdentifier = cloneDependency.getResourceIdentifier.bind(cloneDependency);
          cloneDependency.getResourceIdentifier = () => oldGetResourceIdentifier() + `?theme=${theme}`;
          module.dependencies.push(cloneDependency);
        };

        findSassDependencies().forEach((dep) => {
          this.nonDefaultThemeKeys.forEach(theme => cloneDependencyForTheme(theme, dep));
        });
      });
    });

    // Makes sure that modules contain theme information and that they are
    // duplicated for compilation as well.
    compiler.hooks.beforeCompile.tap(this.pluginName, (params) => {
      params.normalModuleFactory.hooks.beforeResolve.tap(this.pluginName, (module) => {
        const theme = module.dependencies[0].themed;
        const isSassModuleAndIsThemed = module.request.match(/\.scss$/) && theme;
        if (isSassModuleAndIsThemed) {
          // Need to update the request as otherwise webpack will consider it the same
          // module and will reuse the same compilation of it.
          module.request = `${module.request}??theme:${theme}`;
        }
      });
    });

    // Create special loaders for css modules that were marked for themes so that
    // imports can be switched to the different theme one.
    compiler.hooks.beforeCompile.tap(this.pluginName, (params) => {
      params.normalModuleFactory.hooks.module.tap(this.pluginName, (module) => {
        const theme = module.request.match(/\?\?.*theme:([^:?!]+)/);
        if (theme) {
          module.themed = theme[1];
          module.loaders.push({
            loader: require.resolve('./loader.js'),
            options: {
              defaultImportFilename: this.defaultImportFilename,
              defaultImportPath: this.absolutePathThemes[this.defaultTheme],
              targetImportPath: this.absolutePathThemes[theme[1]],
            }
          });
        }
      });
    });

    // Separate theme based css modules in their own chunks.
    compiler.hooks.entryOption.tap(this.pluginName, () => {
      compiler.options.optimization.splitChunks = compiler.options.optimization.splitChunks || {};
      compiler.options.optimization.splitChunks.cacheGroups = compiler.options.optimization.splitChunks.cacheGroups || {};

      const getModuleReasonTheme = (module) => {
        const moduleReason = module.reasons[0].module;
        return moduleReason.themed || null;
      };

      const addThemeChunk = (themeKey) => {
        compiler.options.optimization.splitChunks.cacheGroups[`${this.chunkPrefix}${themeKey}`] = {
          test: (m) => m.constructor.name === 'CssModule' && getModuleReasonTheme(m) === themeKey,
          chunks: 'all',
          enforce: true,
        };
      };

      this.nonDefaultThemeKeys.forEach(theme => addThemeChunk(theme));
    });

    // Required cleanup for functional final compilation.
    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      compilation.hooks.optimizeChunkModules.tap(this.pluginName, chunks => {
        chunks.forEach(chunk => {
          chunk.getModules().forEach(module => {
            // Remove duplicate dependency links for the same css module as otherwise
            // webpack will concatenate IDs on the imports of these modules which will
            // produce an id to a module that doesn't in fact exist.
            if (module.dependencies) {
              module.dependencies = module.dependencies.filter(dep => !dep.themed);
            }
            // Remove from built JS duplicates of css modules classes generated by themes.
            if (module.themed) {
              module.removeChunk(chunk);
            }
          });
        });

        // Remove theme chunks from the entry points so that they are not recognized in
        // a dependency tree and thus we can safely remove the empty JS files generated
        // by these chunks.
        filterThemeChunks(chunks).forEach(chunk => chunk._groups.forEach(entry => entry.removeChunk(chunk)))
      });
    });

    // Remove assets generated by theme chunks that are not css.
    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // @TODO: Deprecated hook in latest webpack version.
      compilation.hooks.optimizeChunkAssets.tap(this.pluginName, chunks => {
        filterThemeChunks(chunks).forEach(chunk => {
          const nonCssAssets = chunk.files.filter(file => !file.match(/\.css$/));
          nonCssAssets.forEach(file => delete compilation.assets[file]);
          chunk.files = chunk.files.filter(file => file.match(/\.css$/));
        });
      });
    });
  }
}

module.exports = MiniCssThemesWebpackPlugin;
