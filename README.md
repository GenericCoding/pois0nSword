# pois0nSword 

In development, not currently useful for users. 


Currently a demonstration of arbitrary webcontent read write using cve-2025-43529 on iOS 26.1. As well as a PAC bypass utilizing CVE-2026-20700. 
Credits:


GenericCoding - main developer
varik - main developer

zeroxjf - fixing webcontent r/w and debugging



- [x] R/W primatives
- [x] PAC bypass / offsets
- [x] GC disabling 
- [x] JitAllowList overwrite
- [x] Get slide
- [x] Get correct vtable for web worker 
- [x] Initial work on creating the web worker for dlopen
- [x] Most iPhone 15 plus offsets for 26.1
- [x] Patch offsets with slide
- [x] Get JSC_base address 
- [ ] Angle-OOB sandbox escape

Most of the code comes from cve-2025-43529 POC by jir4vv1t and the darksword web implementation. (https://github.com/ghh-jb/DarkSword/) 

# Write-up 

For PAC bypass write up see: https://varik.dev/blog/jsc/pois0nsword-native-calls 

For arbitrary webcontent r/w see:
https://varik.dev/blog/jsc/jsc-exploitation-primitives-part-1 

This repo utilizes the Darksword scribble method to obtain read/write64 primatives on iOS 26.1 after bootstrapping addrof and fakeobj primatives, and then disables garbage collection (See WIP branch) with write8 after obtaining the heap and VM addresses. 

Regarding the related ANGLE-OOB bug: The way the OOB referenced in @zeroxjf's analysis repo, *is* related and *is* used in DarkSword, however it is used *after* IPC port which is opened using read / write and offsets, and requires the PAC bypass. Hence why @zeroxjf couldn't verify the OOB fully, without a way of transmitting messages between the OOB and an IPC port; the OOB isn't of use to us at all. 

