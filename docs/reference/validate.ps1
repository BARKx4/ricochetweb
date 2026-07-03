param(
    [string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = "Stop"

$requiredFiles = @(
    "index.html",
    "styles.css",
    "app.js",
    "README.md"
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($file in $requiredFiles) {
    $path = Join-Path $Root $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("Missing required docs file: $file")
    }
}

if ($failures.Count -eq 0) {
    $index = Get-Content -LiteralPath (Join-Path $Root "index.html") -Raw
    $styles = Get-Content -LiteralPath (Join-Path $Root "styles.css") -Raw
    $app = Get-Content -LiteralPath (Join-Path $Root "app.js") -Raw
    $readme = Get-Content -LiteralPath (Join-Path $Root "README.md") -Raw

    $requiredIndexMarkers = @(
        "Ricochet Reference",
        "id=""syntax""",
        "id=""words""",
        "id=""oop""",
        "id=""mvc""",
        "id=""active-record""",
        "id=""turing-complete""",
        "id=""debugging""",
        "id=""cli""",
        "id=""limits"""
    )

    foreach ($marker in $requiredIndexMarkers) {
        if (-not $index.Contains($marker)) {
            $failures.Add("index.html is missing marker: $marker")
        }
    }

    $requiredWords = @(
        '"+"',
        '"add"',
        '"-"',
        '"subtract"',
        '"*"',
        '"/"',
        '"%"',
        '"negate"',
        '"abs"',
        '"min"',
        '"max"',
        '"clamp"',
        '"not"',
        '"and"',
        '"or"',
        '"equals"',
        '"not_equals?"',
        '"assert"',
        '"assert_true"',
        '"assert_false"',
        '"assert_equals"',
        '"assert_ok"',
        '"assert_error"',
        '"less_than?"',
        '"greater_than?"',
        '"less_or_equals?"',
        '"greater_or_equals?"',
        '"self"',
        '"get"',
        '"set"',
        '"var"',
        '"Accessor"',
        '"Table"',
        '"Subclass"',
        '"new"',
        '"swap"',
        '"dup"',
        '"drop"',
        '"over"',
        '"rot"',
        '"nip"',
        '"tuck"',
        '"pick"',
        '"roll"',
        '"depth"',
        '"clear"',
        '"call"',
        '"while"',
        '"break"',
        '"continue"',
        '"send"',
        '"println"',
        '"view"',
        '"text"',
        '"json"',
        '"redirect"',
        '"status"',
        '"header"',
        '"value"',
        '"error"',
        '"array"',
        '"list"',
        '"map"',
        '"Set"',
        '"range"',
        '"push!"',
        '"put!"',
        '"insert!"',
        '"remove!"',
        '"remove_at!"',
        '"clear!"',
        '"count"',
        '"at"',
        '"first"',
        '"last"',
        '"take"',
        '"skip"',
        '"reverse"',
        '"has?"',
        '"keys"',
        '"values"',
        '"each"',
        '"transform"',
        '"select"',
        '"reduce"',
        '"find"',
        '"limit"',
        '"any?"',
        '"all?"',
        '"join"',
        '"trim"',
        '"trim_start"',
        '"trim_end"',
        '"blank?"',
        '"slice"',
        '"index_of"',
        '"last_index_of"',
        '"repeat"',
        '"lines"',
        '"chars"',
        '"split"',
        '"replace"',
        '"contains?"',
        '"starts_with?"',
        '"ends_with?"',
        '"uppercase"',
        '"lowercase"',
        '"concat"',
        '"to_number"',
        '"to_string"',
        '"json_encode"',
        '"json_decode"',
        '"regex"',
        '"matches?"',
        '"captures"',
        '"Method"',
        '"ok?"',
        '"ok"',
        '"fail"',
        '"error?"',
        '"unwrap_or"',
        '"map_result"',
        '"and_then"',
        '"nil?"',
        '"empty?"',
        '"print"',
        '"eprint"',
        '"read_line"',
        '"args"',
        '"env_get"',
        '"cwd"',
        '"now"',
        '"sleep"',
        '"random"',
        '"exit"',
        '"fs_read_text"',
        '"fs_write_text"',
        '"fs_exists?"',
        '"fs_list"',
        '"fs_create_dir"',
        '"http_get"',
        '"http_post_json"',
        '"inspect"',
        '"debug"',
        '"type"',
        '"class_of"',
        '"instance_of?"',
        '"responds_to?"',
        '"fields"',
        '"methods"',
        '"callable?"'
    )

    foreach ($word in $requiredWords) {
        if (-not $app.Contains($word)) {
            $failures.Add("app.js is missing reference entry for: $word")
        }
    }

    $requiredExamples = @(
        "User Model Subclass",
        "HomeController Controller Subclass",
        'GET "/" HomeController "index" route',
        "User all",
        "10 User limit",
        "User count_records",
        "User first_record",
        "1 User exists?",
        "users array",
        "settings map",
        "tags Set",
        "push!",
        "put!",
        "slice",
        "regex value",
        "className get `"Object`" Subclass",
        "multiplier get 0 &gt; while",
        "rco run --debug --step app.rco",
        "rco fmt [--check] [path]",
        "rco run-bytecode [--debug] &lt;path&gt; [args...]",
        "rco package [path] [--gui] [--mvc] [--tui] --output &lt;exe&gt;",
        "rco add &lt;source&gt; [--name NAME] [--no-fetch]",
        "`"lib/math`" import",
        "`"greeter/greeting`" import",
        "[dependencies.greeter]",
        "rco add github:BARKx4/ricochet_auth@v0.1.0 --no-fetch",
        "`"/dashboard`" redirect",
        "rco routes [path]",
        "rco test [--debug] [--filter PATTERN] [path]",
        "fs_read_text",
        "http_get",
        "{ `$user name.get }"
    )

    foreach ($example in $requiredExamples) {
        if (-not $index.Contains($example) -and -not $app.Contains($example)) {
            $failures.Add("Docs are missing example text: $example")
        }
    }

    $requiredCss = @(
        "--ink",
        ".word-grid",
        ".stack-rail",
        "@media"
    )

    foreach ($marker in $requiredCss) {
        if (-not $styles.Contains($marker)) {
            $failures.Add("styles.css is missing marker: $marker")
        }
    }

    if (-not $readme.Contains("Open index.html")) {
        $failures.Add("README.md does not explain how to open the static site")
    }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) {
        Write-Error $failure
    }
    exit 1
}

Write-Host "Ricochet reference docs validation passed."
