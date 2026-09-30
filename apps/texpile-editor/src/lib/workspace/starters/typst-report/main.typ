#import "template.typ": report

#show: report.with(
  title: [The Title of Your Report],
  subtitle: [A subtitle, if it needs one],
  author: "Your Name",
  institution: [Your Institution],
  abstract: [
    Summarize the whole report on its own page: the question, how you went about it, and what you
    found.
  ],
)

#outline()

#include "chapters/introduction.typ"
#include "chapters/method.typ"
#include "chapters/conclusion.typ"

#bibliography("references.bib")
