export const config = /*json-start*/{
  "mainAssemblyName": "PhysicsBridge.dll",
  "resources": {
    "hash": "sha256-XpeeMH5vmwK5yTzU1+YT1Tm3iupu/x/RL9xE+bOcLKM=",
    "jsModuleNative": [
      {
        "name": "dotnet.native.js"
      }
    ],
    "jsModuleRuntime": [
      {
        "name": "dotnet.runtime.js"
      }
    ],
    "wasmNative": [
      {
        "name": "dotnet.native.wasm",
        "hash": "sha256-DTlAch5LIXxrLZ51501dFvY+Zn+9u4x5N9Kk8QL/iO4="
      }
    ],
    "coreAssembly": [
      {
        "virtualPath": "System.Private.CoreLib.wasm",
        "name": "System.Private.CoreLib.wasm",
        "hash": "sha256-1qOc2e9OswVPh6Nush4rSmtzioCrGavsNNMInvWjID0="
      },
      {
        "virtualPath": "System.Runtime.InteropServices.JavaScript.wasm",
        "name": "System.Runtime.InteropServices.JavaScript.wasm",
        "hash": "sha256-lrI2Y4SHpZDk14w20iAOIPC6R+pEZ5n+N7Gty70HiCA="
      }
    ],
    "assembly": [
      {
        "virtualPath": "BepuPhysics.wasm",
        "name": "BepuPhysics.wasm",
        "hash": "sha256-NuJmhvIRzH8Nta4ov0mIPesYsRrcmG0Mdqg9AxzLZNw="
      },
      {
        "virtualPath": "BepuUtilities.wasm",
        "name": "BepuUtilities.wasm",
        "hash": "sha256-zJRCUX+j36LxDTMI7M5BYfJYpE6R7MJMoxhtKrZJpbM="
      },
      {
        "virtualPath": "FastMath.wasm",
        "name": "FastMath.wasm",
        "hash": "sha256-WjvB7ryIBYBxOOG7K0vLC54xbtwjIardUO/hK+/+dAk="
      },
      {
        "virtualPath": "Physics.Integration.wasm",
        "name": "Physics.Integration.wasm",
        "hash": "sha256-ZIY/r+Y6dwnpJXELmYPGrGbfcGfAVZ1UZZTsGWSq2hM="
      },
      {
        "virtualPath": "PhysicsBridge.wasm",
        "name": "PhysicsBridge.wasm",
        "hash": "sha256-jVETXJdExKfWdJzAzXCIi38Sn3YRJf2isHshI4C3+4s="
      },
      {
        "virtualPath": "System.Console.wasm",
        "name": "System.Console.wasm",
        "hash": "sha256-zQiWSsPI25G3vvbYRvIgwguJTBgSuolD7NNADCwDbSg="
      }
    ]
  },
  "debugLevel": 0,
  "globalizationMode": "invariant",
  "runtimeConfig": {
    "runtimeOptions": {
      "configProperties": {
        "Microsoft.Extensions.DependencyInjection.VerifyOpenGenericServiceTrimmability": true,
        "System.ComponentModel.DefaultValueAttribute.IsSupported": false,
        "System.ComponentModel.Design.IDesignerHost.IsSupported": false,
        "System.ComponentModel.TypeConverter.EnableUnsafeBinaryFormatterInDesigntimeLicenseContextSerialization": false,
        "System.ComponentModel.TypeDescriptor.IsComObjectDescriptorSupported": false,
        "System.Data.DataSet.XmlSerializationIsSupported": false,
        "System.Diagnostics.Debugger.IsSupported": false,
        "System.Diagnostics.Metrics.Meter.IsSupported": false,
        "System.Diagnostics.Tracing.EventSource.IsSupported": false,
        "System.Globalization.Invariant": true,
        "System.TimeZoneInfo.Invariant": false,
        "System.Globalization.PredefinedCulturesOnly": true,
        "System.Linq.Enumerable.IsSizeOptimized": true,
        "System.Net.Http.EnableActivityPropagation": false,
        "System.Net.Http.WasmEnableStreamingResponse": true,
        "System.Net.SocketsHttpHandler.Http3Support": false,
        "System.Reflection.Metadata.MetadataUpdater.IsSupported": false,
        "System.Resources.ResourceManager.AllowCustomResourceTypes": false,
        "System.Resources.UseSystemResourceKeys": true,
        "System.Runtime.CompilerServices.RuntimeFeature.IsDynamicCodeSupported": true,
        "System.Runtime.InteropServices.BuiltInComInterop.IsSupported": false,
        "System.Runtime.InteropServices.EnableConsumingManagedCodeFromNativeHosting": false,
        "System.Runtime.InteropServices.EnableCppCLIHostActivation": false,
        "System.Runtime.InteropServices.Marshalling.EnableGeneratedComInterfaceComImportInterop": false,
        "System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization": false,
        "System.StartupHookProvider.IsSupported": false,
        "System.Text.Encoding.EnableUnsafeUTF7Encoding": false,
        "System.Text.Json.JsonSerializer.IsReflectionEnabledByDefault": false,
        "System.Threading.Thread.EnableAutoreleasePool": false
      }
    }
  }
}/*json-end*/;