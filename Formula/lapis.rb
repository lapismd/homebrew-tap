# frozen_string_literal: true

class Lapis < Formula
  desc "Command-line and MCP access to Lapis notes"
  homepage "https://github.com/lapismd/lapis-server"
  version "2.9.2"
  license "Apache-2.0"

  on_macos do
    depends_on arch: :arm64

    on_arm do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.9.2/lapis-v2.9.2-macos-arm64.tar.gz"
      sha256 "35b2c7a9bdcacb757d176541a213f6edc6a1500e5eb1addacfda105696971f2d"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.9.2/lapis-v2.9.2-linux-arm64.tar.gz"
      sha256 "cf02d929e4470657918607d9b1e2fad7345949e8b2b18cd98fa567d829866495"
    end
    on_intel do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.9.2/lapis-v2.9.2-linux-x64.tar.gz"
      sha256 "9d106527cf209662d5d9c444812a0a6ce49ea597c0daed17d0753b868869f126"
    end
  end

  def install
    bin.install "lapis"
    prefix.install "README.md"
  end

  test do
    assert_match "lapis #{version}", shell_output("#{bin}/lapis --version")
    assert_match "MCP", shell_output("#{bin}/lapis --help")
  end
end
