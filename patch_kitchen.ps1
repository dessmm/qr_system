$file = 'app\kitchen\page.tsx'
$lines = Get-Content -Encoding UTF8 $file

# Line 246 (0-indexed: 245) — className
$lines[245] = "                          <p className={``text-xs uppercase font-semibold tracking-wide `${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-400'}``}>"

# Line 247 (0-indexed: 246) — content
$lines[246] = "                            {isUrgent ? 'URGENT: ' : isWarning ? 'LATE: ' : ''}#{order.id.slice(0, 6)}"

Set-Content -Encoding UTF8 $file $lines
Write-Host "Done"
