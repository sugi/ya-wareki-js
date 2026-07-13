#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki (WAREKI_DIR、既定は ../wareki) の定義データを JSON にダンプする。
# 再生成時のみ手元で実行する。CI では実行しない (生成物はコミット済み)。
require 'json'
require 'fileutils'

wareki_dir = ENV['WAREKI_DIR'] || File.expand_path('../../wareki', __dir__)
wareki_lib = File.join(wareki_dir, 'lib')
File.directory?(wareki_lib) or abort "wareki gem source not found: #{wareki_lib}"
$LOAD_PATH.unshift wareki_lib
# wareki.rb 本体は ya_kansuji gem を要求するため、データ定義ファイルだけを読む
require 'wareki/calendar_def'
require 'wareki/era_def'

# JS の Number.MAX_SAFE_INTEGER。DAY_MAX (Bignum) の代替
JD_MAX = 9_007_199_254_740_991

def era_rows(defs)
  defs.map { |e| [e.name, e.year, e.start, e.end > JD_MAX ? JD_MAX : e.end] }
end

out_dir = File.expand_path('data', __dir__)
FileUtils.mkdir_p(out_dir)

years = Wareki::YEAR_DEFS.map do |y|
  { year: y.year, start: y.start, end: y.end, leapMonth: y.leap_month,
    monthStarts: y.month_starts, monthDays: y.month_days }
end
File.write(File.join(out_dir, 'year-defs.json'), JSON.pretty_generate(years))
File.write(File.join(out_dir, 'era-defs.json'), JSON.pretty_generate(
  eraDefs: era_rows(Wareki::ERA_DEFS), eraNorthDefs: era_rows(Wareki::ERA_NORTH_DEFS)
))
puts "years: #{years.size}, eras: #{Wareki::ERA_DEFS.size}, north: #{Wareki::ERA_NORTH_DEFS.size}"
