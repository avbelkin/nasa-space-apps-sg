-- Usage: osascript verify-powerpoint.applescript /absolute/input.pptx /absolute/proof.pdf
on run argv
 set inputPath to item 1 of argv
 set outputPath to item 2 of argv
 set inputFile to (POSIX file inputPath) as alias
 set expectedName to name of (info for inputFile)
 set outputFile to POSIX file outputPath
 with timeout of 120 seconds
  tell application "Microsoft PowerPoint"
   open inputFile
   set slideCount to 0
   repeat 60 times
    delay 1
    set deckDoc to active presentation
    try
     if name of deckDoc is expectedName then set slideCount to count of slides of deckDoc
    end try
    if slideCount is 7 then exit repeat
   end repeat
   if slideCount is not 7 then error "Expected seven loaded slides before export."
   save deckDoc in outputFile as save as PDF
   delay 5
   close deckDoc saving no
   return "PowerPoint " & version & ", slides=" & slideCount
  end tell
 end timeout
end run
