import fs                 from 'fs'
import childProcess       from 'child_process'
import path               from 'path'
import gulp               from 'gulp'
import gutil              from 'gulp-util'
import webpack            from 'webpack'
import webpackStream      from 'webpack-stream'
import WebpackDevServer   from 'webpack-dev-server'
import BrowserSyncPlugin  from 'browser-sync-webpack-plugin'
import ExtractTextPlugin  from 'extract-text-webpack-plugin'
import replace            from 'gulp-replace'

const PRODUCTION = process.argv.indexOf('--production') > -1
const port = {
  devServer: 3100,
  browserSync: 3000
}

gulp.task('copy', () =>
  gulp
    .src('src/index.html')
    .pipe(replace(/\n(\s*){{stylesheet}}/, PRODUCTION ? '\n$1<link rel="stylesheet" type="text/css" href="style.css">' : ''))
    .pipe(gulp.dest('dist'))
)
gulp.task('clean', () =>
  childProcess.exec('rm -rf '+path.resolve(__dirname, 'dist'))
)
gulp.task('build', ['clean', 'copy'], build)
gulp.task('watch', ['clean', 'copy'], webpackDevServer)
gulp.task('default', ['watch'])

function build() {
  const conf = {
    ...getWebpackBaseConfig(),
    plugins: [
      new webpack.optimize.UglifyJsPlugin(),
      new webpack.DefinePlugin({ PRODUCTION }),
      new ExtractTextPlugin('style.css')
    ]
  }
  const options = {
    config: [{
      ...conf,
      target: 'node',
      output: {
        filename: 'index.js'
      }
    }, {
      ...conf,
      target: 'web',
      output: {
        filename: 'ajapaik-geotagger.js',
        library: 'AjapaikGeotagger'
      }
    }]
  }

  return webpackStream(options)
    .on('error', error)
    .pipe(gulp.dest('dist'))
}

function getWebpackBaseConfig() {
  const cssLoader = `css?sourceMap&modules&importLoaders=2&localIdentName=[name]_[local]_[hash:base64:6]!postcss!sass?sourceMap`

  return {
    entry: './src/index.js',
    module: {
      loaders: [{
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      }, {
        test: /\.scss$/,
        loader: PRODUCTION
          ? ExtractTextPlugin.extract('style', cssLoader)
          : `style!${cssLoader}`
      }, {
        test: /\.svg$/,
        loader: 'file-loader'
      }/*, {
        test: /\.(jpg|jpeg|png|woff|woff2|eot|ttf|svg)/,
        loader: 'url-loader?limit=100000'
      }*/]
    },
    devtool: 'source-map',
    postcss: function () {
      return [
        require('autoprefixer')(/* project-wide options are in browserslist file in project root */)
      ]
    }
  }
}

function webpackDevServer() {
  const config = {
    ...getWebpackBaseConfig(),
    entry: [
      `webpack-dev-server/client?http://localhost:${port.devServer}/`,
      'webpack/hot/dev-server',
      path.resolve(__dirname, 'src/index.js')
    ],
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist'),
      publicPath: `http://localhost:${port.browserSync}/`,
      filename: 'ajapaik-geotagger.js',
      library: 'AjapaikGeotagger'
    },
    plugins: [
      new webpack.HotModuleReplacementPlugin(),
      new webpack.DefinePlugin({ PRODUCTION }),
      new BrowserSyncPlugin({
        host: '0.0.0.0',
        port: port.browserSync,
        proxy: `http://localhost:${port.devServer}/`,
        notify: false
      }, {
        reload: false
      })
    ]
  }
  
  return new WebpackDevServer(webpack(config), {
    contentBase: path.resolve(__dirname, 'dist'),
    publicPath: '/',
    hot: true,
    quiet: true,
    noInfo: true,
    stats: { colors: true },
    setup(app) {
      app.get('/favicon.ico', (req, res) =>
        res.sendStatus(200)
      )
    }
  })
  .listen(port.devServer, 'localhost', (err) => {
    if (err)
      throw new gutil.PluginError('webpack-dev-server', err)
    
    gutil.log('[webpack-dev-server]', `http://localhost:${port.devServer}`)
  })
}

function error(err) {
  console.error(err.stack || err)
  this.emit('end')
}