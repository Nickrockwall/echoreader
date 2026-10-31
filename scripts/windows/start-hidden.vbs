' Runs start-echoreader.cmd without a console window (used from the Startup folder).
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & here & "\start-echoreader.cmd""", 0, False
