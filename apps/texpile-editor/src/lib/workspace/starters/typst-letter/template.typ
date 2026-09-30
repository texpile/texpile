// The look of the letter: the addresses, the date, the subject line and the signature.
// main.typ holds the words.

#let letter(
  sender: [],
  recipient: [],
  date: datetime.today(),
  subject: none,
  closing: [Sincerely,],
  signature: [],
  body,
) = {
  set page(margin: (x: 2.5cm, top: 2.5cm, bottom: 2.5cm))
  set text(size: 11pt, lang: "en")
  set par(spacing: 1.3em)

  align(right, sender)
  v(1.5cm)
  recipient
  v(1cm)
  align(right, date.display("[month repr:long] [day padding:none], [year]"))
  if subject != none {
    v(0.5cm)
    strong(subject)
  }
  v(0.5cm)

  body

  v(0.8cm)
  closing
  v(1.6cm)
  signature
}
