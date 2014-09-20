var gulp = require('gulp')
  , uglify = require('gulp-uglify')
  , rename = require('gulp-rename');

gulp.task('default', function() {
  gulp.src('jquery.tera.js')
    .pipe(uglify())
    .pipe(rename({extname:'.min.js'}))
    .pipe(gulp.dest('.'));
});