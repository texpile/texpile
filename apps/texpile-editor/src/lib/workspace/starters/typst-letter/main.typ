#import "template.typ": letter

#show: letter.with(
  sender: [
    Your Name \
    123 Your Street \
    Your City, ST 12345
  ],
  recipient: [
    Recipient Name \
    Their Organization \
    456 Their Street \
    Their City, ST 67890
  ],
  subject: [The subject of your letter],
  closing: [Sincerely,],
  signature: [Your Name],
)

Dear Recipient Name,

Begin your letter here. The addresses, the subject and the signature are filled in above, the date
is today's, and the layout is set up in `template.typ`.

Keep to one point per paragraph, and leave an empty line between paragraphs.

Close by saying what you would like to happen next, and how to reach you.
