const path = require('path');
const fs = require('fs');
const loaderUtils = require('loader-utils');

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

    const areThemesSingleEntry = typeof themes[defaultTheme] === 'string';
    const themeEntryKeys = areThemesSingleEntry ? [] : Object.keys(themes[defaultTheme]);

    const validateThemeFile = (themePath, themeKey, entry = null) => {
      const fullPath = path.resolve(themePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Theme '${entry ? `${themeKey}.${entry}` : themeKey}' file not found: ${fullPath}`);
      }
    };

    Object.entries(themes).forEach(([themeKey, fileOrFilesObject]) => {
      if (areThemesSingleEntry) {
        if (typeof fileOrFilesObject !== 'string') {
          throw new Error(`All themes value must be a string (path to theme file) as the default theme is also string.`);
        }
        return validateThemeFile(fileOrFilesObject, themeKey);
      }

      if (typeof fileOrFilesObject !== 'object') {
        throw new Error(`Themes value must be either object or string.`);
      }

      const currentThemeEntryKeys = Object.keys(fileOrFilesObject);
      if (currentThemeEntryKeys.length !== themeEntryKeys.length || themeEntryKeys.filter((k) => !currentThemeEntryKeys.includes(k)).length) {
        throw new Error(`Missing or additional theme entries in '${themeKey}'. All themes must match schema of default theme.`);
      }

      Object.entries(fileOrFilesObject).forEach(([entry, path]) => {
        validateThemeFile(path, themeKey, entry);
      });
    });
  }

  init({themes, defaultTheme, chunkPrefix}) {
    this.pluginName = this.constructor.name;
    this.themes = themes;
    this.defaultTheme = defaultTheme;
    this.chunkPrefix = chunkPrefix || 'theme__';

    this.nonDefaultThemeKeys = Object.keys(this.themes).filter(t => t !== this.defaultTheme);
    this.themeChunkNames = this.nonDefaultThemeKeys.map(theme => `${this.chunkPrefix}${theme}`);

    const areThemesSingleEntry = typeof themes[defaultTheme] === 'string';
    this.absoluteThemePaths = {};

    Object.entries(themes).forEach(([key, fileOrFilesObject]) => {
      if (areThemesSingleEntry) {
        this.absoluteThemePaths[key] = [path.resolve(fileOrFilesObject)];
      } else {
        this.absoluteThemePaths[key] = Object.entries(fileOrFilesObject)
          .sort((a, b) => a.key > b.key ? -1 : 1)
          .reduce((reduced, [,current]) =>  reduced.push(current) && reduced, []);
      }
    });

    this.defaultImportFilenames = this.absoluteThemePaths[this.defaultTheme].map((themePath) => path.basename(themePath).replace(/\.[a-zA-Z0-9]+$/, ''));
  }

  apply(compiler) {
    const filterThemeChunks = chunks => chunks.filter(chunk =>
      this.themeChunkNames.find(c => chunk.chunkReason && chunk.chunkReason.indexOf(`(cache group: ${c})`) !== -1)
    );

    this.themedModules = [];

    const findSassDependencies = (module) => module.dependencies.filter(dep => dep.request && dep.request.match(/\.scss$/));
    const cloneDependencyForTheme = (theme, dep) => {
      const cloneDependency = Object.assign(Object.create(Object.getPrototypeOf(dep)), dep);
      // Mark for which theme we are cloning the sass dependency.
      cloneDependency.themed = theme;
      // Need to modify the identifier so that it is recorded as a separate dependency.
      // Otherwise webpack will consider them the same deps and not attempt creating
      // different modules for them.
      const oldGetResourceIdentifier = cloneDependency.getResourceIdentifier.bind(cloneDependency);
      cloneDependency.getResourceIdentifier = () => oldGetResourceIdentifier() + `?theme=${theme}`;
      return cloneDependency;
    };

    const themeSassDependencies = (module) => {
      findSassDependencies(module).forEach((dep) => {
        this.nonDefaultThemeKeys.forEach(theme => {
          const clone = cloneDependencyForTheme(theme, dep);
          module.dependencies.push(clone);
        });
        this.themedModules.push(path.join(module.context, dep.request));
      });
    }

    const transformSassDependencies = (module, theme) => {
      findSassDependencies(module).forEach((dep) => {
        const clone = cloneDependencyForTheme(theme, dep);
        module.dependencies.splice(module.dependencies.indexOf(dep), 1);
        module.dependencies.push(clone);
      });
    };

    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // Finds import dependencies targeted to sass files and duplicates them for each theme.
      compilation.hooks.succeedModule.tap(this.pluginName, module => {
        // For modules that have been marked for theming we need to ensure to make their dependencies unique,
        // since otherwise webpack will not include these dependencies in the themed version as well.
        let theme;
        if (module.request && (theme = module.request.match(/\?\?.*theme:([^:?!]+)/))) {
          transformSassDependencies(module, theme[1]);
          return;
        }

        // Prevent theming dependencies of already themed modules. Since the root module is already themed, the theme
        // will apply accordingly in dependencies as well (?).
        if (module.issuer && this.themedModules.indexOf(module.issuer.resource) !== -1) {
          this.themedModules.push(module.resource);
          return;
        }

        themeSassDependencies(module);
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
        const loaderPath = require.resolve('./loader.js');
        if (theme && !module.loaders.find(l => l.loader === loaderPath)) {
          module.themed = theme[1];
          module.loaders.push({
            loader: require.resolve('./loader.js'),
            options: {
              defaultImportFilenames: this.defaultImportFilenames,
              defaultImportPaths: this.absoluteThemePaths[this.defaultTheme],
              targetImportPaths: this.absoluteThemePaths[theme[1]],
            }
          });
        }
      });
    });

    // Make sure to not generate different hashes for classes loaded from
    // theme files as composes.
    compiler.hooks.environment.tap(this.pluginName, () => {
      const fileToThemeFileTypeMap = {};
      const classNamesPerThemeFileTypes = {};

      Object.entries(this.themes).forEach(([_, fileOrFiles]) => {
        if (typeof fileOrFiles === 'string') {
          fileToThemeFileTypeMap[fileOrFiles] = 'default';
        } else {
          Object.entries(fileOrFiles).forEach(([type, file]) => {
            fileToThemeFileTypeMap[path.resolve(file)] = type;
          });
        }
      });

      compiler.options.module.rules.forEach((rule) => {
        (Array.isArray(rule.use) ? rule.use : [rule.use])
          .filter((loader) => loader.loader === 'css-loader' && loader.options && loader.options.modules)
          .forEach((loader) => {
            const isCssLoaderOldVersion = typeof loader.options.modules === 'boolean';
            let originalGetLocalIdent;

            if (isCssLoaderOldVersion) {
              originalGetLocalIdent = loader.options.getLocalIdent || require('css-loader/dist/utils').getLocalIdent;
            } else {
              originalGetLocalIdent = loader.options.modules.getLocalIdent || ((loaderContext, localIdentName, localName, options) =>{
                const {context, hashPrefix} = options;
                const {resourcePath} = loaderContext;
                const request = path.relative(context, resourcePath);

                options.content = `${hashPrefix + request}\x00${localName}`;
                return loaderUtils.interpolateName(loaderContext, localIdentName, options)
                  .replace(/\[local]/gi, localName);
              });
            }

            const getLocalIdent = (...args) => {
              const [module,,className] = args;
              const themeFileType = fileToThemeFileTypeMap[module.resourcePath];
              const hasClassName = themeFileType
                && classNamesPerThemeFileTypes[themeFileType]
                && classNamesPerThemeFileTypes[themeFileType][className];

              if (hasClassName) {
                return classNamesPerThemeFileTypes[themeFileType][className];
              }

              const ident = originalGetLocalIdent(...args);

              if (!hasClassName && themeFileType) {
                classNamesPerThemeFileTypes[themeFileType] = classNamesPerThemeFileTypes[themeFileType] || {};
                classNamesPerThemeFileTypes[themeFileType][className] = ident;
              }

              return ident;
            };

            if (isCssLoaderOldVersion) {
              loader.options.getLocalIdent = getLocalIdent;
            } else {
              loader.options.modules.getLocalIdent = getLocalIdent;
            }
          });
      });
    });

    // Separate theme based css modules in their own chunks.
    compiler.hooks.entryOption.tap(this.pluginName, () => {
      compiler.options.optimization.splitChunks = compiler.options.optimization.splitChunks || {};
      compiler.options.optimization.splitChunks.cacheGroups = compiler.options.optimization.splitChunks.cacheGroups || {};

      const hasReasonTheme = (module, theme) => {
        const actualTheme = module._identifier.match(/\?\?theme:([^:?!]+)/);
        return actualTheme ? actualTheme[1] === theme : false;
      };

      const addThemeChunk = (themeKey) => {
        compiler.options.optimization.splitChunks.cacheGroups[`${this.chunkPrefix}${themeKey}`] = {
          test: (m) => m.constructor.name === 'CssModule' && hasReasonTheme(m, themeKey),
          chunks: 'all',
          name: (_module, chunks, name) => `${name}~${chunks.map(c => c.name).join('~')}`,
          enforce: true,
        };
      };

      this.nonDefaultThemeKeys.forEach(theme => addThemeChunk(theme));
    });

    let moduleDependencyHistory = [];
    let moduleChunkHistory = [];

    // Required cleanup for functional final compilation.
    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      compilation.hooks.optimizeChunkModules.tap(this.pluginName, chunks => {
        chunks.forEach(chunk => {
          chunk.getModules().forEach(module => {
            // Remove duplicate dependency links for the same css module as otherwise
            // webpack will concatenate IDs on the imports of these modules which will
            // produce an id to a module that doesn't in fact exist.
            if (module.dependencies && module.dependencies.find(dep => !dep.themed)) {
              moduleDependencyHistory.push({module, dependencies: module.dependencies});
              module.dependencies = module.dependencies.filter(dep => !dep.themed);
            }
            // Remove from built JS duplicates of css modules classes generated by themes.
            if (module.themed) {
              moduleChunkHistory.push({module, chunk});
              module.removeChunk(chunk);
            }
          });
        });

        // Remove theme chunks from the entry points so that they are not recognized in
        // a dependency tree and thus we can safely remove the empty JS files generated
        // by these chunks.
        filterThemeChunks(chunks).forEach(chunk => chunk._groups.forEach(entry => entry.removeChunk(chunk)));
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

    // When in watch mode, we need to revert previous cleanup as otherwise dependency
    // links will be lost and the themes won't be included in future compilations.
    compiler.hooks.watchRun.tap(this.pluginName, () => {
      compiler.hooks.afterCompile.tap(this.pluginName, () => {
        if (moduleDependencyHistory.length) {
          moduleDependencyHistory.forEach((history) => history.module.dependencies = history.dependencies);
          moduleDependencyHistory = [];
        }

        if (moduleChunkHistory.length) {
          moduleChunkHistory.forEach((history) => history.chunk.addModule(history.module));
          moduleChunkHistory = [];
        }
      });
    });

  }
}

module.exports = MiniCssThemesWebpackPlugin;
