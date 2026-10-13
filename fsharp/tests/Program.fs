module Program

open Expecto

// Finds every [<Tests>] value in every lesson's test file.
[<EntryPoint>]
let main argv = runTestsInAssemblyWithCLIArgs [] argv
