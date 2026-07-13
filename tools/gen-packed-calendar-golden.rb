#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki のビットパック済み旧暦テーブルとの比較用に、
# JD → 旧暦年月日の対照表 CSV を生成する。
#
# pack 化対応版は Wareki::Calendar だけを読み込むため、ya_kansuji gem は不要。
# WAREKI_DIR には feat/packed-calendar-def 以降の wareki を指定すること。
# .git を持たないチェックアウトでは WAREKI_PROVENANCE も指定できる。
require 'csv'
require 'open3'

wareki_dir = ENV['WAREKI_DIR'] || File.expand_path('../../wareki', __dir__)
wareki_lib = File.join(wareki_dir, 'lib')
$LOAD_PATH.unshift wareki_lib
begin
  require 'wareki/calendar'
rescue LoadError
  abort "WAREKI_DIR does not contain wareki/calendar: #{wareki_dir}"
end

def wareki_provenance(wareki_dir)
  return ENV['WAREKI_PROVENANCE'] if ENV['WAREKI_PROVENANCE']

  out, _err, status = Open3.capture3('git', '-C', wareki_dir, 'describe', '--always', '--dirty')
  status.success? && !out.strip.empty? ? out.strip : 'unknown'
end

calendar = Wareki::Calendar
required_constants = %i(YEAR_MIN YEAR_MAX JD_MIN JD_MAX)
missing = required_constants.reject { |name| calendar.const_defined?(name, false) }
unless missing.empty? && calendar.respond_to?(:find_date_ary)
  abort "WAREKI_DIR does not contain the packed Wareki::Calendar API: #{missing.join(', ')}"
end

jds = []
# 旧暦の対応範囲全体を37日刻みでサンプリングする。
(calendar::JD_MIN..calendar::JD_MAX).step(37) { |jd| jds << jd }

# 公開 lookup API で全期間を走査し、全月の初日とその前後を追加する。
# PACKED のビット配置には依存せず、月大小・閏月・年境界に起因する
# off-by-one を重点的に検証する。
(calendar::JD_MIN..calendar::JD_MAX).each do |jd|
  parts = calendar.find_date_ary(jd)
  abort "Wareki::Calendar returned nil inside its supported range: JD #{jd}" unless parts

  jds.concat [jd - 2, jd - 1, jd, jd + 1] if parts[2] == 1
end
jds.concat [calendar::JD_MIN, calendar::JD_MAX]

jds = jds.select { |jd| jd.between?(calendar::JD_MIN, calendar::JD_MAX) }.uniq.sort
provenance = wareki_provenance(wareki_dir)
output = ENV['GOLDEN_OUTPUT'] || File.expand_path('../test/golden/packed-calendar.csv', __dir__)

File.open(output, 'w') do |file|
  file.puts "# wareki packed-calendar: #{provenance}"
  csv = CSV.new(file)
  csv << %w(jd year month day isLeap)
  jds.each do |jd|
    parts = calendar.find_date_ary(jd)
    abort "Wareki::Calendar returned nil inside its supported range: JD #{jd}" unless parts

    csv << [jd, parts[0], parts[1], parts[2], parts[3]]
  end
end

puts "rows: #{jds.size}"
