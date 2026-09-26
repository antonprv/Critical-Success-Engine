export const config = /*json-start*/{
  "mainAssemblyName": "PhysicsBridge.dll",
  "resources": {
    "hash": "sha256-L6yLhwaW+Ffvkkkvumzdu5Ed/64k6D2ywpWRfZhJPG4=",
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
        "hash": "sha256-xJyNP/3FP/0GoEiPyUIHf/Nu1CcJrWqIKHei2WsBeAg="
      },
      {
        "virtualPath": "BepuUtilities.wasm",
        "name": "BepuUtilities.wasm",
        "hash": "sha256-PjHk18cbSf5MBtz5JAOd+W2IfHU1MpQHVBRiWRNv8mo="
      },
      {
        "virtualPath": "FastMath.wasm",
        "name": "FastMath.wasm",
        "hash": "sha256-Hl7sZihU2X0QXALvRkqbeXatfC4oAR4kJmsZ5W54ZEs="
      },
      {
        "virtualPath": "Physics.Integration.wasm",
        "name": "Physics.Integration.wasm",
        "hash": "sha256-Y6QEDcAK+Ep1Y6Tb8ZSnlDEMMewn9elYYo+mszbwhYw="
      },
      {
        "virtualPath": "PhysicsBridge.wasm",
        "name": "PhysicsBridge.wasm",
        "hash": "sha256-ZOR3nKhYVvxprRPwA+dqQA980nPczBHF9HB1w6sSSAU="
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