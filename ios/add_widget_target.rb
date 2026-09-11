# One-shot script: adds the TodayWidget WidgetKit extension target to App.xcodeproj.
# Run from ios/: ruby add_widget_target.rb
require 'xcodeproj'

proj = Xcodeproj::Project.open(File.join(__dir__, 'App', 'App.xcodeproj'))
app = proj.targets.find { |t| t.name == 'App' } or abort 'App target not found'

if proj.targets.any? { |t| t.name == 'TodayWidget' }
  abort 'TodayWidget target already exists — nothing to do.'
end

widget = proj.new_target(:app_extension, 'TodayWidget', :ios, '17.0')

group = proj.main_group.new_group('TodayWidget', 'TodayWidget')
swift = group.new_file('TodayWidget.swift')
group.new_file('Info.plist')
group.new_file('TodayWidget.entitlements')
widget.add_file_references([swift])

widget.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.lybury1.today.TodayWidget'
  s['INFOPLIST_FILE'] = 'TodayWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = 'TodayWidget/TodayWidget.entitlements'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
end

app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end

app.add_dependency(widget)

embed = app.copy_files_build_phases.find { |p| p.symbol_dst_subfolder_spec == :plug_ins }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
end
bf = embed.add_file_reference(widget.product_reference)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

proj.save
puts 'TodayWidget target added and embedded in App.'
