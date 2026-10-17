# The main physics build (WebAssembly SIMD), then the fallback for hosts without SIMD (CSE_NO_SIMD: the wide math on
# FastMath) - the main dotnet.js refuses to start without SIMD, so those hosts need a runtime of their own.
set -e
dotnet publish "../src/CSEngine/Modules/Physics/Bridge/Bridge.csproj" -c Release -p:TrimmerSingleWarn=false -v:normal > publish.log
dotnet publish "../src/CSEngine/Modules/Physics/Bridge/Bridge.csproj" -c Release -p:TrimmerSingleWarn=false -p:CseNoSimd=true -v:normal >> publish.log
