# frozen_string_literal: true

class Lapis < Formula
  desc "Command-line and MCP access to Lapis notes"
  homepage "https://github.com/lapismd/lapis-server"
  version "2.10.0"
  license "Apache-2.0"

  on_macos do
    depends_on arch: :arm64

    on_arm do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.10.0/lapis-v2.10.0-macos-arm64.tar.gz"
      sha256 "a8818cda616136c877d2d078db3d485c120d913086e87ecfd503652a8f0195b2"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.10.0/lapis-v2.10.0-linux-arm64.tar.gz"
      sha256 "6ca11c290d9e604b70d5f63916ac6e5cce8d214ab044cd11dde7c383161cf848"
    end
    on_intel do
      url "https://github.com/lapismd/lapis-server/releases/download/v2.10.0/lapis-v2.10.0-linux-x64.tar.gz"
      sha256 "590cd990219524b2e339968d40eca24ad4f8ea451efa3b2f6fb8a4f7bff96a74"
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
