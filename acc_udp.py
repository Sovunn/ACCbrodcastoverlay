# ──────────────────────────────────────────────
#  ACC UDP Broadcast client
#  Protocol version 4 (ACC 1.6+)
# ──────────────────────────────────────────────
from __future__ import annotations

import socket
import struct
import threading
import time
from enum import IntEnum
from typing import Optional

from data_store import (
    CarEntry, CarRealtime, DataStore, DriverInfo, SessionInfo,
)

PROTOCOL_VERSION = 4


class MsgIn(IntEnum):
    REGISTRATION_RESULT = 1
    REALTIME_UPDATE     = 2
    REALTIME_CAR_UPDATE = 3
    ENTRY_LIST          = 4
    TRACK_DATA          = 5
    ENTRY_LIST_CAR      = 6
    BROADCAST_EVENT     = 7


class MsgOut(IntEnum):
    REGISTER_COMMAND_APPLICATION   = 1
    UNREGISTER_COMMAND_APPLICATION = 9
    REQUEST_ENTRY_LIST             = 10
    REQUEST_TRACK_DATA             = 11


class ACCUDPClient:
    def __init__(
        self,
        data_store: DataStore,
        host: str   = "127.0.0.1",
        port: int   = 9000,
        display_name: str        = "ACC Overlay",
        connection_password: str = "",
        command_password: str    = "",
        update_interval_ms: int  = 250,
    ) -> None:
        self.store                = data_store
        self.host                 = host
        self.port                 = port
        self.display_name         = display_name
        self.connection_password  = connection_password
        self.command_password     = command_password
        self.update_interval_ms   = update_interval_ms

        self.sock: Optional[socket.socket] = None
        self.connection_id = -1
        self._running      = False
        self._thread: Optional[threading.Thread] = None

    # ── Lifecycle ─────────────────────────────

    def start(self) -> None:
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True, name="acc-udp")
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self.sock and self.connection_id >= 0:
            try:
                self.sock.sendto(self._unregister_msg(), (self.host, self.port))
            except OSError:
                pass
        if self.sock:
            self.sock.close()

    # ── Main receive loop ─────────────────────

    def _loop(self) -> None:
        while self._running:
            try:
                self._connect_and_receive()
            except Exception as exc:
                print(f"[ACC UDP] Error: {exc}")
                self.store.set_disconnected()
                time.sleep(5.0)

    def _connect_and_receive(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(5.0)
        sock.bind(("", 0))
        self.sock = sock

        print(f"[ACC UDP] Connecting to {self.host}:{self.port} …")
        sock.sendto(self._register_msg(), (self.host, self.port))

        while self._running:
            try:
                data, _ = sock.recvfrom(65535)
                self._dispatch(data)
            except socket.timeout:
                # Re-send registration so ACC keeps sending us updates
                if self.connection_id < 0:
                    sock.sendto(self._register_msg(), (self.host, self.port))

    # ── Outbound builders ─────────────────────

    @staticmethod
    def _ws(buf: bytearray, s: str) -> None:
        """Write ACC string (uint16 length + UTF-8 bytes)."""
        enc = s.encode("utf-8")
        buf += struct.pack("<H", len(enc))
        buf += enc

    def _register_msg(self) -> bytes:
        buf = bytearray()
        buf.append(MsgOut.REGISTER_COMMAND_APPLICATION)
        buf.append(PROTOCOL_VERSION)
        self._ws(buf, self.display_name)
        self._ws(buf, self.connection_password)
        buf += struct.pack("<i", self.update_interval_ms)
        self._ws(buf, self.command_password)
        return bytes(buf)

    def _unregister_msg(self) -> bytes:
        buf = bytearray()
        buf.append(MsgOut.UNREGISTER_COMMAND_APPLICATION)
        buf += struct.pack("<i", self.connection_id)
        return bytes(buf)

    def _request_entry_list(self) -> None:
        buf = bytearray()
        buf.append(MsgOut.REQUEST_ENTRY_LIST)
        buf += struct.pack("<i", self.connection_id)
        try:
            self.sock.sendto(bytes(buf), (self.host, self.port))
        except OSError:
            pass

    def _request_track_data(self) -> None:
        buf = bytearray()
        buf.append(MsgOut.REQUEST_TRACK_DATA)
        buf += struct.pack("<i", self.connection_id)
        try:
            self.sock.sendto(bytes(buf), (self.host, self.port))
        except OSError:
            pass

    # ── Parser helpers ────────────────────────

    @staticmethod
    def _rs(buf: bytes, off: int) -> tuple[str, int]:
        """Read ACC string → (string, new_offset)."""
        (length,) = struct.unpack_from("<H", buf, off)
        off += 2
        s    = buf[off : off + length].decode("utf-8", errors="replace")
        return s, off + length

    @staticmethod
    def _rl(buf: bytes, off: int) -> tuple[int, int]:
        """Read LapInfo → (lap_time_ms, new_offset)."""
        lap_ms = struct.unpack_from("<i", buf, off)[0]
        off += 4
        off += 2 + 2   # car_index + driver_index
        split_count = buf[off]
        off += 1
        off += split_count * 4   # int32 splits
        off += 4                 # 4 × bool flags
        return lap_ms, off

    # ── Dispatcher ────────────────────────────

    def _dispatch(self, data: bytes) -> None:
        if not data:
            return
        msg_type = data[0]
        off      = 1
        try:
            if   msg_type == MsgIn.REGISTRATION_RESULT:  self._on_registration(data, off)
            elif msg_type == MsgIn.REALTIME_UPDATE:       self._on_realtime_update(data, off)
            elif msg_type == MsgIn.REALTIME_CAR_UPDATE:   self._on_car_update(data, off)
            elif msg_type == MsgIn.ENTRY_LIST:            self._on_entry_list(data, off)
            elif msg_type == MsgIn.ENTRY_LIST_CAR:        self._on_entry_list_car(data, off)
            elif msg_type == MsgIn.TRACK_DATA:            self._on_track_data(data, off)
        except (struct.error, IndexError) as exc:
            print(f"[ACC UDP] Parse error (msg={msg_type}): {exc}")

    # ── Message handlers ──────────────────────

    def _on_registration(self, buf: bytes, off: int) -> None:
        conn_id      = struct.unpack_from("<i", buf, off)[0]; off += 4
        is_read_only = buf[off];                              off += 1
        err_msg, off = self._rs(buf, off)

        if conn_id < 0:
            print(f"[ACC UDP] Registration failed: {err_msg}")
            return

        self.connection_id = conn_id
        self.store.set_connected(conn_id)
        print(f"[ACC UDP] Registered (id={conn_id}, read_only={bool(is_read_only)})")
        self._request_entry_list()
        self._request_track_data()

    def _on_realtime_update(self, buf: bytes, off: int) -> None:
        off += 2 + 2   # event_index, session_index
        session_type = buf[off]; off += 1
        phase        = buf[off]; off += 1
        session_time = struct.unpack_from("<f", buf, off)[0]; off += 4
        session_end  = struct.unpack_from("<f", buf, off)[0]; off += 4
        off += 4       # focused_car_index
        _,  off = self._rs(buf, off)   # active_camera_set
        _,  off = self._rs(buf, off)   # active_camera
        _,  off = self._rs(buf, off)   # current_hud_page
        is_replay = buf[off]; off += 1
        if is_replay:
            off += 8   # replay session_time + remaining_time
        time_of_day = struct.unpack_from("<f", buf, off)[0]; off += 4
        off += 5       # ambient_temp, track_temp, clouds, rain_level, wetness
        best_ms, off = self._rl(buf, off)

        self.store.update_session(SessionInfo(
            session_type    = session_type,
            phase           = phase,
            session_time    = session_time,
            session_end_time= session_end,
            time_of_day     = time_of_day,
            best_session_lap_ms = best_ms,
        ))

    def _on_car_update(self, buf: bytes, off: int) -> None:
        car_index    = struct.unpack_from("<H", buf, off)[0]; off += 2
        driver_index = struct.unpack_from("<H", buf, off)[0]; off += 2
        driver_count = buf[off];                               off += 1
        gear         = struct.unpack_from("<b", buf, off)[0]; off += 1
        off += 4 + 4 + 4   # worldPosX, worldPosY, yaw
        car_location = buf[off]; off += 1
        speed_kmh    = struct.unpack_from("<f", buf, off)[0]; off += 4
        position     = struct.unpack_from("<H", buf, off)[0]; off += 2
        cup_position = struct.unpack_from("<H", buf, off)[0]; off += 2
        track_pos    = struct.unpack_from("<H", buf, off)[0]; off += 2
        spline       = struct.unpack_from("<f", buf, off)[0]; off += 4
        laps         = struct.unpack_from("<H", buf, off)[0]; off += 2
        delta        = struct.unpack_from("<i", buf, off)[0]; off += 4
        best_ms,  off = self._rl(buf, off)
        last_ms,  off = self._rl(buf, off)
        _cur_ms,  off = self._rl(buf, off)

        self.store.update_car_realtime(CarRealtime(
            car_index       = car_index,
            driver_index    = driver_index,
            driver_count    = driver_count,
            gear            = gear,
            speed_kmh       = speed_kmh,
            position        = position,
            cup_position    = cup_position,
            track_position  = track_pos,
            spline_position = spline,
            laps            = laps,
            delta           = delta,
            best_session_lap_ms = best_ms,
            last_lap_ms     = last_ms,
            car_location    = car_location,
        ))

    def _on_entry_list(self, buf: bytes, off: int) -> None:
        off += 4   # connection_id
        # Individual car details will arrive as ENTRY_LIST_CAR packets

    def _on_entry_list_car(self, buf: bytes, off: int) -> None:
        car_index  = struct.unpack_from("<H", buf, off)[0]; off += 2
        car_model  = buf[off];                               off += 1
        team, off  = self._rs(buf, off)
        race_num   = struct.unpack_from("<i", buf, off)[0]; off += 4
        cup_cat    = buf[off];                               off += 1
        cur_driver = struct.unpack_from("<b", buf, off)[0]; off += 1
        drv_count  = buf[off];                               off += 1

        drivers = []
        for _ in range(drv_count):
            fn,  off = self._rs(buf, off)
            ln,  off = self._rs(buf, off)
            sn,  off = self._rs(buf, off)
            cat  = buf[off]; off += 1
            nat, off = self._rs(buf, off)
            drivers.append(DriverInfo(
                first_name  = fn,
                last_name   = ln,
                short_name  = sn,
                category    = cat,
                nationality = nat,
            ))

        nationality = struct.unpack_from("<i", buf, off)[0]

        self.store.update_car_entry(CarEntry(
            car_index            = car_index,
            car_model_type       = car_model,
            team_name            = team,
            race_number          = race_num,
            cup_category         = cup_cat,
            current_driver_index = max(0, cur_driver),
            drivers              = drivers,
            nationality          = nationality,
        ))

    def _on_track_data(self, buf: bytes, off: int) -> None:
        off += 4   # connection_id
        name, off   = self._rs(buf, off)
        off += 4   # track_id
        length_m    = struct.unpack_from("<f", buf, off)[0]
        self.store.update_track(name, length_m)
        print(f"[ACC UDP] Track: {name} ({length_m:.0f} m)")
