@rem The main physics build (WebAssembly SIMD), then the fallback for hosts without SIMD (CSE_NO_SIMD).
dotnet publish "../src/CSEngine/Modules/Physics/Bridge/Bridge.csproj" -c Release -p:TrimmerSingleWarn=false -v:normal > publish.log || exit /b 1
dotnet publish "../src/CSEngine/Modules/Physics/Bridge/Bridge.csproj" -c Release -p:TrimmerSingleWarn=false -p:CseNoSimd=true -v:normal >> publish.log
