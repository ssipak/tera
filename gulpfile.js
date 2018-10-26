var gulp = require('gulp');
var envify = require('gulp-envify');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

gulp.task('default', function() {
  gulp.src('jquery.tera.js')
    .pipe(envify({NODE_ENV: 'production'}))
    .pipe(uglify())
    .pipe(rename({extname:'.min.js'}))
    .pipe(gulp.dest('.'));
});