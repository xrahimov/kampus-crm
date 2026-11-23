Pod::Spec.new do |s|
  s.name           = 'KampusCall'
  s.version        = '1.0.0'
  s.summary        = 'What only native code can do for a Kampus lesson'
  s.description    = 'On iPhone and iPad: opens the system sheet that starts sharing the screen, and hears from the broadcast extension when sharing begins and ends.'
  s.license        = 'UNLICENSED'
  s.author         = 'Kampus'
  s.homepage       = 'https://kampus.center'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ReplayKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
